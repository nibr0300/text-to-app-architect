import { AppSpec } from "@/types/appSpec";
import { GeneratedFile } from "@/types/generatedProject";
import { ReviewFinding, ReviewReport, ReviewSection } from "@/types/review";
import { LintIssue, lintProject } from "@/lib/lintProject";

const REVIEW_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/review-codebase`;

export const REVIEW_AREAS = [
  { id: "architecture", label: "Arkitektur & kodhälsa" },
  { id: "functionality", label: "Funktionalitet & specuppfyllnad" },
  { id: "security", label: "Säkerhet & behörigheter" },
  { id: "buildability", label: "Byggbarhet & beroenden" },
] as const;

export function planReviewStages() {
  return [
    { id: "lint", label: "Statisk analys (syntax, plattformsanrop, nycklar)" },
    ...REVIEW_AREAS.map((a) => ({ id: `area:${a.id}`, label: `AI-revision: ${a.label}` })),
    { id: "verdict", label: "Sammanvägt utlåtande" },
  ];
}

interface StageBody {
  stage: "audit" | "verdict";
  area?: string;
  spec?: AppSpec | null;
  files?: GeneratedFile[];
  sections?: ReviewSection[];
  lint?: LintIssue[];
}

async function call(body: StageBody): Promise<Record<string, unknown>> {
  const resp = await fetch(REVIEW_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ error: `Error ${resp.status}` }));
    throw new Error((data as { error?: string }).error || `Error ${resp.status}`);
  }

  const text = await resp.text();
  let data: { error?: string } & Record<string, unknown>;
  try {
    data = JSON.parse(text.trim());
  } catch {
    throw new Error("Ogiltigt svar från servern.");
  }
  if (data.error) throw new Error(data.error);
  return data;
}

const SEVERITY_BY_LINT: Record<string, ReviewFinding["severity"]> = {
  error: "critical",
  warning: "major",
};

export function lintSection(issues: LintIssue[]): ReviewSection {
  return {
    id: "lint",
    title: "Statisk analys",
    summary: issues.length
      ? `${issues.length} avvikelse(r) hittade av den deterministiska analysen.`
      : "Inga syntaxfel, oskyddade plattformsanrop eller ofiltrerade BLE-scan hittades.",
    findings: issues.map((issue, i) => ({
      id: `lint-${issue.rule}-${i}`,
      severity: SEVERITY_BY_LINT[issue.severity] ?? "minor",
      title: `${issue.path.split("/").pop()} — ${issue.rule}`,
      detail: issue.message,
      paths: [issue.path],
    })),
  };
}

export interface ReviewCallbacks {
  onStageStart: (id: string) => void;
  onStageDone: (id: string, section?: ReviewSection) => void;
  onStageError: (id: string, error: string) => void;
}

export async function reviewCodebase(
  files: GeneratedFile[],
  spec: AppSpec | null,
  source: "generated" | "upload",
  cb: ReviewCallbacks,
): Promise<ReviewReport> {
  const sections: ReviewSection[] = [];

  cb.onStageStart("lint");
  const issues = lintProject(files);
  const lintSec = lintSection(issues);
  sections.push(lintSec);
  cb.onStageDone("lint", lintSec);

  for (const area of REVIEW_AREAS) {
    const id = `area:${area.id}`;
    cb.onStageStart(id);
    try {
      const res = await call({ stage: "audit", area: area.id, spec, files });
      const section = res.section as ReviewSection | undefined;
      if (section) {
        sections.push(section);
        cb.onStageDone(id, section);
      } else {
        cb.onStageDone(id);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Okänt fel";
      cb.onStageError(id, msg);
      throw e;
    }
  }

  cb.onStageStart("verdict");
  let verdict = {
    completeness: 0,
    verdict: "",
    strengths: [] as string[],
    nextSteps: [] as string[],
  };
  try {
    const res = await call({ stage: "verdict", sections, lint: issues });
    verdict = { ...verdict, ...(res.verdict as typeof verdict) };
    cb.onStageDone("verdict");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Okänt fel";
    cb.onStageError("verdict", msg);
    throw e;
  }

  return {
    ...verdict,
    sections,
    generatedAt: new Date().toISOString(),
    source,
    fileCount: files.length,
  };
}

/** Sends the files touched by a finding to the generator's repair stage. */
export async function repairFinding(
  spec: AppSpec | null,
  finding: ReviewFinding,
  files: GeneratedFile[],
): Promise<GeneratedFile[]> {
  const affected = files.filter((f) => finding.paths.some((p) => f.path.endsWith(p) || p.endsWith(f.path)));
  if (affected.length === 0) throw new Error("Hittade inga filer för den här punkten.");

  const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({
      stage: "repair",
      spec: spec ?? { appName: "Uppladdat projekt", packageName: "com.example.app" },
      files: affected,
      issues: [
        {
          path: finding.paths[0] ?? affected[0].path,
          rule: finding.id,
          severity: finding.severity === "critical" ? "error" : "warning",
          message: `${finding.title}. ${finding.detail}${finding.suggestion ? ` Åtgärd: ${finding.suggestion}` : ""}`,
        },
      ],
    }),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ error: `Error ${resp.status}` }));
    throw new Error((data as { error?: string }).error || `Error ${resp.status}`);
  }
  const text = await resp.text();
  const data = JSON.parse(text.trim()) as { files?: GeneratedFile[]; error?: string };
  if (data.error) throw new Error(data.error);
  return data.files ?? [];
}
