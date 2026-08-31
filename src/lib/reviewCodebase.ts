import { AppSpec } from "@/types/appSpec";
import { BuildContract, GeneratedFile } from "@/types/generatedProject";
import {
  ReviewDelta,
  ReviewFinding,
  ReviewReport,
  ReviewRoadmapStep,
  ReviewSection,
  RoadmapRepairResult,
} from "@/types/review";
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

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeText(value: string): string {
  return value.toLocaleLowerCase("sv-SE").replace(/[^a-z0-9åäö]+/g, " ").trim();
}

export function findingFingerprint(finding: ReviewFinding): string {
  const paths = [...finding.paths].sort().join("|");
  return stableHash(`${paths}|${normalizeText(finding.title)}`);
}

function stabilizeSection(section: ReviewSection): ReviewSection {
  return {
    ...section,
    findings: section.findings.map((finding) => {
      const fingerprint = findingFingerprint(finding);
      return { ...finding, id: `finding-${fingerprint}`, fingerprint };
    }),
  };
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
  return stabilizeSection({
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
  });
}

function allFindings(report: ReviewReport): ReviewFinding[] {
  return report.sections.flatMap((section) => section.findings);
}

export function compareReports(current: ReviewReport, previous: ReviewReport | null): ReviewDelta | undefined {
  if (!previous || previous.source !== current.source) return undefined;
  const oldMap = new Map(allFindings(previous).map((finding) => [finding.fingerprint ?? findingFingerprint(finding), finding]));
  const newMap = new Map(allFindings(current).map((finding) => [finding.fingerprint ?? findingFingerprint(finding), finding]));
  const criticalNow = allFindings(current).filter((finding) => finding.severity === "critical").length;
  const criticalBefore = allFindings(previous).filter((finding) => finding.severity === "critical").length;
  const majorNow = allFindings(current).filter((finding) => finding.severity === "major").length;
  const majorBefore = allFindings(previous).filter((finding) => finding.severity === "major").length;
  return {
    completeness: current.completeness - previous.completeness,
    resolved: [...oldMap.keys()].filter((key) => !newMap.has(key)),
    remaining: [...newMap.keys()].filter((key) => oldMap.has(key)),
    introduced: [...newMap.keys()].filter((key) => !oldMap.has(key)),
    critical: criticalNow - criticalBefore,
    major: majorNow - majorBefore,
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
  previous: ReviewReport | null = null,
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
        const stableSection = stabilizeSection(section);
        sections.push(stableSection);
        cb.onStageDone(id, stableSection);
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
    roadmap: [] as ReviewRoadmapStep[],
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

  const report: ReviewReport = {
    ...verdict,
    sections,
    generatedAt: new Date().toISOString(),
    source,
    fileCount: files.length,
  };
  report.delta = compareReports(report, previous);
  return report;
}

function mergeFiles(existing: GeneratedFile[], incoming: GeneratedFile[]): GeneratedFile[] {
  const map = new Map(existing.map((file) => [file.path, file]));
  for (const file of incoming) map.set(file.path, file);
  return [...map.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function isSafeProjectPath(path: string): boolean {
  return path.length > 0 && path.length <= 500 && !path.startsWith("/") && !path.includes("\\") && !path.split("/").includes("..");
}

function lintKey(issue: LintIssue): string {
  return `${issue.severity}|${issue.rule}|${issue.path}|${issue.line ?? ""}`;
}

interface ProjectRepairResponse {
  files?: GeneratedFile[];
  repair?: {
    addressedFindingIds?: string[];
    changedPaths?: string[];
    manualFollowUps?: string[];
  };
  error?: string;
}

/** Applies one coordinated roadmap stage against the complete project tree. */
export async function repairRoadmapStep(
  spec: AppSpec | null,
  report: ReviewReport,
  step: ReviewRoadmapStep,
  files: GeneratedFile[],
  contract: BuildContract | null = null,
): Promise<RoadmapRepairResult> {
  if (!files.length) throw new Error("Hittade inga projektfiler att reparera.");
  const lintBefore = lintProject(files);

  const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({
      stage: "projectRepair",
      spec: spec ?? { appName: "Uppladdat projekt", packageName: "com.example.app" },
      files,
      contract,
      reviewReport: report,
      roadmapStep: step,
    }),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ error: `Error ${resp.status}` }));
    throw new Error((data as { error?: string }).error || `Error ${resp.status}`);
  }
  const text = await resp.text();
  let data: ProjectRepairResponse;
  try {
    data = JSON.parse(text.trim()) as ProjectRepairResponse;
  } catch {
    throw new Error("AI:n returnerade ett ogiltigt reparationssvar.");
  }
  if (data.error) throw new Error(data.error);
  const changed = data.files ?? [];
  if (!changed.length) throw new Error("AI:n returnerade inga ändrade filer för etappen.");
  if (changed.some((file) => !isSafeProjectPath(file.path) || typeof file.content !== "string")) {
    throw new Error("Reparationsbatchen innehöll en osäker eller ogiltig filsökväg och avvisades.");
  }

  const merged = mergeFiles(files, changed);
  const lintAfter = lintProject(merged);
  const beforeKeys = new Set(lintBefore.map(lintKey));
  const introducedIssues = lintAfter.filter((issue) => !beforeKeys.has(lintKey(issue)));
  if (introducedIssues.length || lintAfter.length > lintBefore.length) {
    const reason = introducedIssues[0]?.message ?? "den statiska felbilden förvärrades";
    throw new Error(`Batchen avvisades av regressionsskyddet: ${reason}. Ingen kod uppdaterades.`);
  }

  return {
    files: merged,
    changedPaths: changed.map((file) => file.path),
    addressedFindingIds: data.repair?.addressedFindingIds ?? step.findingIds,
    manualFollowUps: data.repair?.manualFollowUps ?? [],
    lintBefore: lintBefore.length,
    lintAfter: lintAfter.length,
  };
}
