import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE = `You are a ruthless senior Android reviewer performing an independent code audit, in the spirit of a second-opinion expert review. You are given the source of an Android project (Kotlin/Java + XML + Gradle) and optionally the app specification it was built from.

Review principles:
- Be concrete and evidence-based. Every finding must point at real file paths and describe what the code actually does versus what it should do.
- Hunt for PLACEBO LOGIC above all: features that look implemented in the UI but never touch a real API, hardcoded/simulated data, sensor loops that fake values, buttons that only show a Toast.
- Never invent problems. If an area is genuinely sound, say so with few or no findings.
- Do not restate the same problem in several findings.
- Write all user-visible text (title, detail, suggestion, summary) in the same language as the project's UI strings and the spec; default to Swedish if unclear.

Severity scale: "critical" = app cannot build or the core promise does not work; "major" = a specified feature is missing/faked or a real security problem; "minor" = quality, robustness, accessibility; "info" = observations.

OUTPUT FORMAT (strict): return ONLY a JSON object, no markdown fences.`;

const AREA_PROMPTS: Record<string, { title: string; instructions: string }> = {
  architecture: {
    title: "Arkitektur & kodhälsa",
    instructions: `Audit architecture and code health:
- Dead code: classes, repositories, data models, helpers that are never referenced.
- Duplicate/competing storage (e.g. SharedPreferences written both directly and through a store), duplicated state, two sources of truth.
- God-activities, missing separation between UI, data and network layers.
- Lifecycle problems: leaked listeners/receivers/coroutines, work not cancelled in onDestroy, missing ViewBinding cleanup.
- Threading: blocking calls on the main thread.`,
  },
  functionality: {
    title: "Funktionalitet & specuppfyllnad",
    instructions: `Audit whether the app actually does what it claims:
- For every feature promised by the spec (or by the UI itself when no spec is given), state whether it is REALLY implemented, partially implemented, or placebo.
- Flag simulated data, fake sensor readings, tone synthesis instead of real audio, hardcoded lists.
- Flag UI controls that are wired to nothing, and screens unreachable through any Intent.
- Flag missing error/empty/offline states for network and device calls.`,
  },
  security: {
    title: "Säkerhet & behörigheter",
    instructions: `Audit security and permissions:
- Hardcoded API keys, tokens, secrets, static OAuth Bearer tokens without refresh flow.
- Cleartext HTTP, disabled TLS verification, exported components without protection, unvalidated intent extras.
- Runtime permissions: declared in the manifest but never requested, or requested with the deprecated onRequestPermissionsResult.
- Logging of sensitive data, HttpLoggingInterceptor active in release builds.
- Missing minify/proguard for release.`,
  },
  buildability: {
    title: "Byggbarhet & beroenden",
    instructions: `Audit whether this project would actually compile and run:
- Syntax corruption, truncated files, stray tokens, unbalanced braces.
- Activities used in Intents but not registered in AndroidManifest.xml.
- Referenced resources (layouts, ids, strings, menus, drawables) that do not exist in the project.
- Gradle dependencies declared but never imported, or imports with no declared dependency.
- SDK/plugin version mismatches, missing viewBinding/buildConfig flags, missing gradle wrapper files.`,
  },
};

const AUDIT_SHAPE = `{"summary":"one or two sentences","findings":[{"id":"kebab-case-id","severity":"critical|major|minor|info","title":"short title","detail":"what is wrong and why it matters","paths":["app/src/..."],"suggestion":"concrete fix"}]}`;

const VERDICT_PROMPT = `You receive the findings from every audit area (plus deterministic static-analysis results). Produce the overall verdict and ONE coherent completion roadmap.

The roadmap is not a restatement of findings. Group findings that share a root cause or require coordinated cross-file changes into atomic stages. Order stages by dependency: build foundation first, then contracts/data/API, implementation, navigation/resources, and final quality. A later stage may depend on earlier stage ids. Every stage must have testable acceptance criteria. Never create competing fixes for the same root cause.

Return ONLY:
{"completeness": 0-100 integer estimate of how much of a genuinely working app exists, "verdict":"2-4 sentences, direct and honest", "strengths":["what is genuinely well done"], "nextSteps":["prioritised actions, most important first"], "roadmap":[{"id":"stable-kebab-id","order":1,"title":"short stage title","objective":"the project-level outcome","rationale":"why these findings must be solved together","findingIds":["existing finding id"],"paths":["all files likely requiring coordinated edits"],"dependsOn":[],"acceptanceCriteria":["specific verifiable condition"]}]}

Every critical or major finding must belong to exactly one roadmap stage. Use only finding ids and file paths present in the supplied audit. Weigh critical findings heavily: a project that cannot compile or whose core feature is placebo cannot score above 60.`;

interface Finding {
  id?: string;
  severity?: string;
  title?: string;
  detail?: string;
  paths?: string[];
  suggestion?: string;
}

async function callModel(model: string, system: string, user: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const status = response.status;
    console.error("AI gateway error:", status, await response.text());
    throw new Error(
      status === 429
        ? "Rate limited. Vänta en stund och försök igen."
        : status === 402
          ? "AI-krediter slut. Lägg till krediter i din workspace."
          : status === 403
            ? "AI är blockerat för denna workspace."
            : "Granskningen misslyckades.",
    );
  }

  const data = await response.json();
  const raw: string = data.choices?.[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, ""));
  } catch {
    console.error("Failed to parse model output", raw.slice(0, 500));
    throw new Error("AI:n returnerade ogiltig JSON.");
  }
}

interface HandlerResult {
  section?: unknown;
  verdict?: unknown;
  error?: string;
}

interface RoadmapStepInput {
  id?: unknown;
  order?: unknown;
  title?: unknown;
  objective?: unknown;
  rationale?: unknown;
  findingIds?: unknown;
  paths?: unknown;
  dependsOn?: unknown;
  acceptanceCriteria?: unknown;
}

function stringList(value: unknown, limit = 50): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0).slice(0, limit)
    : [];
}

function sanitizeRoadmap(value: unknown, validFindingIds: Set<string>) {
  if (!Array.isArray(value)) return [];
  const raw = value.slice(0, 12) as RoadmapStepInput[];
  const ids = raw.map((step, index) =>
    typeof step.id === "string" && /^[a-z0-9-]{2,80}$/.test(step.id) ? step.id : `stage-${index + 1}`,
  );
  return raw.map((step, index) => ({
    id: ids[index],
    order: index + 1,
    title: typeof step.title === "string" ? step.title.slice(0, 160) : `Etapp ${index + 1}`,
    objective: typeof step.objective === "string" ? step.objective.slice(0, 1000) : "",
    rationale: typeof step.rationale === "string" ? step.rationale.slice(0, 1000) : "",
    findingIds: stringList(step.findingIds).filter((id) => validFindingIds.has(id)),
    paths: stringList(step.paths, 100),
    dependsOn: stringList(step.dependsOn).filter((id) => ids.slice(0, index).includes(id)),
    acceptanceCriteria: stringList(step.acceptanceCriteria, 20),
    status: "pending",
  }));
}

async function handle(body: Record<string, unknown>): Promise<HandlerResult> {
  const { stage, area, spec, files, sections, lint } = (body ?? {}) as {
    stage?: string;
    area?: string;
    spec?: unknown;
    files?: { path: string; content: string }[];
    sections?: unknown;
    lint?: unknown;
  };

  if (stage === "audit") {
    const cfg = area ? AREA_PROMPTS[area] : undefined;
    if (!cfg) return { error: "Invalid area" };
    if (!files?.length) return { error: "Inga filer att granska." };

    const tree = files.map((f) => `--- ${f.path} ---\n${f.content}`).join("\n\n");
    let user = `PROJECT FILE INDEX:\n${files.map((f) => f.path).join("\n")}\n\n`;
    if (spec) user += `APP SPECIFICATION (what was promised):\n${JSON.stringify(spec, null, 2)}\n\n`;
    user += `PROJECT SOURCE:\n${tree}`;

    const model = area === "security" || area === "buildability" ? "openai/gpt-5.5" : "google/gemini-3.7-flash";
    const parsed = await callModel(
      model,
      `${BASE}\n\nAUDIT AREA: ${cfg.title}\n${cfg.instructions}\n\nReturn exactly: ${AUDIT_SHAPE}`,
      user,
    );

    const findings = ((parsed.findings ?? []) as Finding[])
      .filter((f) => f && typeof f.title === "string")
      .map((f, i) => ({
        id: f.id || `${area}-${i}`,
        severity: ["critical", "major", "minor", "info"].includes(String(f.severity))
          ? f.severity
          : "minor",
        title: f.title,
        detail: f.detail ?? "",
        paths: Array.isArray(f.paths) ? f.paths.filter((p) => typeof p === "string") : [],
        suggestion: f.suggestion,
      }));

    return {
      section: { id: area, title: cfg.title, summary: parsed.summary ?? "", findings },
    };
  }

  if (stage === "verdict") {
    const user = `AUDIT SECTIONS:\n${JSON.stringify(sections ?? [], null, 2)}\n\nSTATIC ANALYSIS:\n${JSON.stringify(lint ?? [], null, 2)}`;
    const parsed = await callModel("openai/gpt-5.5", `${BASE}\n\n${VERDICT_PROMPT}`, user);
    const pct = Number(parsed.completeness);
    const sectionList = Array.isArray(sections) ? sections as { findings?: { id?: unknown }[] }[] : [];
    const validFindingIds = new Set(
      sectionList.flatMap((section) => section.findings ?? [])
        .map((finding) => finding.id)
        .filter((id): id is string => typeof id === "string"),
    );
    return {
      verdict: {
        completeness: Number.isFinite(pct) ? Math.max(0, Math.min(100, Math.round(pct))) : 0,
        verdict: parsed.verdict ?? "",
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
        nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
        roadmap: sanitizeRoadmap(parsed.roadmap, validFindingIds),
      },
    };
  }

  return { error: "Invalid stage" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const body = await req.json().catch(() => ({}));

  // Heartbeats keep the connection alive past the 150s idle timeout.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(" "));
        } catch {
          /* stream closed */
        }
      }, 10_000);

      let payload: HandlerResult;
      try {
        payload = await handle(body);
      } catch (e) {
        console.error("review-codebase error:", e);
        payload = { error: e instanceof Error ? e.message : "Unknown error" };
      }
      clearInterval(heartbeat);
      controller.enqueue(encoder.encode(JSON.stringify(payload)));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
