import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE_RULES = `You are a senior Android engineer. You generate production-quality Kotlin + XML for a native Android app from a JSON app specification.

Global conventions (ALWAYS follow):
- Kotlin, minSdk 24, targetSdk 34, AGP 8.x, Gradle Kotlin DSL (build.gradle.kts).
- ViewBinding for all layouts (no findViewById, no Compose).
- Retrofit 2 + Gson + OkHttp logging for network, coroutines (lifecycleScope) for async work.
- Every screen id maps to: res/layout/activity_<screen_id>.xml and an Activity class named from the screen name in PascalCase + "Activity".
- Accessibility first: large text sizes, contentDescription on every non-text view, high contrast, TalkBack friendly.
- Text-to-Speech, when used, must init with Locale("sv", "SE") and fall back to Locale.getDefault() if unavailable.
- Network calls need explicit timeouts (10s) and user-visible error handling; a local/self-hosted server (e.g. Ollama) must degrade gracefully with a clear offline message instead of crashing.
- No TODOs, no placeholder comments — write complete, compilable code.

OUTPUT FORMAT (strict): return ONLY a JSON object, no markdown fences:
{"files":[{"path":"relative/path/from/project/root","content":"full file content"}]}`;

const STAGE_PROMPTS: Record<string, string> = {
  skeleton: `Generate the project skeleton ONLY:
- settings.gradle.kts, build.gradle.kts (root), app/build.gradle.kts (viewBinding on, all needed dependencies derived from the spec: Retrofit, Gson, OkHttp, CameraX + ML Kit barcode if camera/scanning is implied, coroutines, Material3), gradle.properties, app/proguard-rules.pro, .gitignore
- app/src/main/AndroidManifest.xml registering EVERY screen as an activity (launcher screen gets the LAUNCHER intent-filter) and declaring all permissions from the spec
- app/src/main/res/values/colors.xml, strings.xml, themes.xml (Material3 dark theme using the spec theme colors)
Do NOT generate activities, layouts, models or network code in this stage.`,
  screen: `Generate EXACTLY two files for the single screen given below:
- app/src/main/res/layout/activity_<screen_id>.xml using the screen's layout root and all its components (ids from the spec, properties applied: text, hint, textSize, backgroundColor, inputType, style)
- app/src/main/java/<package path>/<Name>Activity.kt using ViewBinding, wiring every component event from the spec, and performing navigation with explicit Intents to the target activities.
Reference data/network classes by their expected names (data classes in package .data, Retrofit services in .network, repositories in .repository) — do not define them here.`,
  data: `Generate the data and network layer ONLY:
- one Kotlin data class file per data model in package <pkg>.data
- a PreferencesStore (SharedPreferences wrapper) in <pkg>.data for any model that represents user settings/preferences
- one Retrofit service interface per API in <pkg>.network (with the spec's endpoints), plus an ApiClient object building Retrofit instances with the spec base URLs and 10s timeouts
- one Repository class per API in <pkg>.repository exposing suspend functions that wrap the service and return Result<T> with error handling.
Do NOT generate activities or layouts in this stage.`,
  review: `You receive the complete generated project file tree. Fix ONLY real correctness problems: missing/incorrect imports, references to classes or ids that do not exist, activities missing from the manifest, layout ids not matching ViewBinding usage, missing Gradle dependencies for used libraries, and Kotlin syntax errors.
Return ONLY the files you actually changed (full content for each). If nothing needs changing return {"files":[]}.`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { stage, spec, screen, files } = body ?? {};

    if (!stage || !STAGE_PROMPTS[stage]) {
      return new Response(JSON.stringify({ error: "Invalid stage" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!spec) {
      return new Response(JSON.stringify({ error: "Spec is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const pkg = spec.packageName ?? "com.example.app";
    const pkgPath = `app/src/main/java/${String(pkg).replace(/\./g, "/")}`;

    let userContent = `Package: ${pkg}\nJava/Kotlin source root: ${pkgPath}\n\nAPP SPECIFICATION:\n${JSON.stringify(
      stage === "screen" ? { ...spec, screens: undefined } : spec,
      null,
      2,
    )}`;

    if (stage === "screen") {
      userContent += `\n\nSCREEN TO GENERATE:\n${JSON.stringify(screen, null, 2)}\n\nAll screen ids for navigation targets: ${(spec.screens ?? [])
        .map((s: { id: string; name: string }) => `${s.id} (${s.name})`)
        .join(", ")}`;
    }
    if (stage === "review") {
      const tree = (files ?? []) as { path: string; content: string }[];
      userContent += `\n\nPROJECT FILES:\n${tree
        .map((f) => `--- ${f.path} ---\n${f.content}`)
        .join("\n\n")}`;
    }

    const model = stage === "review" ? "openai/gpt-5.5" : "google/gemini-3.7-flash";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: `${BASE_RULES}\n\nSTAGE INSTRUCTIONS:\n${STAGE_PROMPTS[stage]}` },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      const text = await response.text();
      console.error("AI gateway error:", status, text);
      const message =
        status === 429
          ? "Rate limited. Vänta en stund och försök igen."
          : status === 402
            ? "AI-krediter slut. Lägg till krediter i din workspace."
            : status === 403
              ? "AI är blockerat för denna workspace."
              : "Kodgenereringen misslyckades.";
      return new Response(JSON.stringify({ error: message }), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const raw: string = data.choices?.[0]?.message?.content ?? "{}";
    let parsed: { files?: { path: string; content: string }[] };
    try {
      parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, ""));
    } catch {
      console.error("Failed to parse model output", raw.slice(0, 500));
      return new Response(JSON.stringify({ error: "AI:n returnerade ogiltig JSON." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const outFiles = (parsed.files ?? []).filter(
      (f) => f && typeof f.path === "string" && typeof f.content === "string",
    );

    return new Response(JSON.stringify({ files: outFiles }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-code error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
