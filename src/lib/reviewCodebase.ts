import { AppSpec } from "@/types/appSpec";
import { BuildContract, GeneratedFile } from "@/types/generatedProject";
import {
  CompletedItem,
  ProcessAudit,
  ReviewDelta,
  ReviewFinding,
  ReviewReport,
  ReviewRoadmapStep,
  ReviewSection,
  RepairBlocker,
  RepairFailureCategory,
  RoadmapRepairAttempt,
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

export function planReviewStages(withProcessAudit = false) {
  return [
    { id: "lint", label: "Statisk analys (syntax, plattformsanrop, nycklar)" },
    ...REVIEW_AREAS.map((a) => ({ id: `area:${a.id}`, label: `AI-revision: ${a.label}` })),
    ...(withProcessAudit
      ? [{ id: "process", label: "Processgranskning: metodval, roadmap och tidigare försök" }]
      : []),
    { id: "verdict", label: "Sammanvägt utlåtande" },
  ];
}

interface StageBody {
  stage: "audit" | "verdict" | "process";
  area?: string;
  spec?: AppSpec | null;
  files?: GeneratedFile[];
  sections?: ReviewSection[];
  lint?: LintIssue[];
  directives?: string[];
  excluded?: { title: string; reason: string }[];
  roadmap?: ReviewRoadmapStep[];
  processAudit?: ProcessAudit | null;
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

export interface ReviewOptions {
  directives?: string[];
  excluded?: { title: string; reason: string }[];
}

/** The process audit is only meaningful once repair attempts exist to learn from. */
export function hasRepairExperience(roadmap: ReviewRoadmapStep[]): boolean {
  return roadmap.some((step) => (step.attempts?.length ?? 0) > 0);
}

/**
 * A new roadmap stage that reuses an earlier stage id inherits its attempt history,
 * so an already failed strategy stays blocked across reviews.
 */
export function carryOverAttempts(
  roadmap: ReviewRoadmapStep[],
  previousRoadmap: ReviewRoadmapStep[],
): ReviewRoadmapStep[] {
  const byId = new Map(previousRoadmap.map((step) => [step.id, step]));
  return roadmap.map((step) => {
    const prior = byId.get(step.id);
    if (!prior?.attempts?.length) return step;
    return { ...step, attempts: [...prior.attempts, ...(step.attempts ?? [])] };
  });
}


export async function reviewCodebase(
  files: GeneratedFile[],
  spec: AppSpec | null,
  source: "generated" | "upload",
  cb: ReviewCallbacks,
  previous: ReviewReport | null = null,
  options: ReviewOptions = {},
): Promise<ReviewReport> {
  const sections: ReviewSection[] = [];
  const directives = (options.directives ?? []).filter((item) => item.trim().length > 0);
  const excluded = options.excluded ?? [];

  cb.onStageStart("lint");
  const issues = lintProject(files);
  const lintSec = lintSection(issues);
  sections.push(lintSec);
  cb.onStageDone("lint", lintSec);

  for (const area of REVIEW_AREAS) {
    const id = `area:${area.id}`;
    cb.onStageStart(id);
    try {
      const res = await call({ stage: "audit", area: area.id, spec, files, directives });
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

  const priorRoadmap = previous?.roadmap ?? [];
  let processAudit: ProcessAudit | null = null;
  if (hasRepairExperience(priorRoadmap)) {
    cb.onStageStart("process");
    try {
      const res = await call({ stage: "process", roadmap: priorRoadmap, lint: issues, files, directives });
      processAudit = (res.processAudit as ProcessAudit | undefined) ?? null;
      cb.onStageDone("process");
    } catch (e) {
      // A failed process audit must never block the substantive review.
      cb.onStageError("process", e instanceof Error ? e.message : "Okänt fel");
    }
  }

  cb.onStageStart("verdict");
  let verdict = {
    completeness: 0,
    verdict: "",
    strengths: [] as string[],
    nextSteps: [] as string[],
    roadmap: [] as ReviewRoadmapStep[],
    completed: [] as CompletedItem[],
  };
  try {
    const res = await call({ stage: "verdict", sections, lint: issues, directives, excluded, processAudit, roadmap: priorRoadmap });
    verdict = { ...verdict, ...(res.verdict as typeof verdict) };
    cb.onStageDone("verdict");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Okänt fel";
    cb.onStageError("verdict", msg);
    throw e;
  }

  const completed = verdict.completed ?? [];
  // Fulfilled directives leave the binding list; finished stages leave the roadmap.
  const fulfilledDirectives = new Set(
    completed.filter((item) => item.kind === "directive").map((item) => item.title),
  );
  const completedStageIds = new Set(completed.filter((item) => item.kind === "stage" && item.id).map((item) => item.id as string));

  const report: ReviewReport = {
    ...verdict,
    completed,
    roadmap: carryOverAttempts(verdict.roadmap, priorRoadmap).filter((step) => !completedStageIds.has(step.id)),
    processAudit: processAudit ?? undefined,
    sections,
    generatedAt: new Date().toISOString(),
    source,
    fileCount: files.length,
    directives: directives.filter((item) => !fulfilledDirectives.has(item)),
  };
  report.delta = compareReports(report, previous);

  return report;
}

function mergeFiles(
  existing: GeneratedFile[],
  incoming: GeneratedFile[],
  deletePaths: string[] = [],
): GeneratedFile[] {
  const map = new Map(existing.map((file) => [file.path, file]));
  for (const path of deletePaths) map.delete(path);
  for (const file of incoming) map.set(file.path, file);
  return [...map.values()].sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * The build pushes the in-app file list to a fresh folder and compiles it with a
 * preinstalled Gradle 8.7. Nobody can run shell commands and no wrapper jar exists,
 * so blockers demanding those actions describe work the pipeline already does.
 */
const IMPOSSIBLE_BLOCKER = /\b(git\s+rm|git\s+commit|git\s+push|gradle\s+wrapper|gradle-wrapper\.jar|gradlew|host environment must|run the following command|android studio|adb\b)/i;

export function invalidHostBlocker(blockers: RepairBlocker[]): RepairBlocker | undefined {
  return blockers.find((blocker) => IMPOSSIBLE_BLOCKER.test(`${blocker.detail} ${blocker.requiredAction}`));
}

function isSafeProjectPath(path: string): boolean {
  return path.length > 0 && path.length <= 500 && !path.startsWith("/") && !path.includes("\\") && !path.split("/").includes("..");
}

function lintKey(issue: LintIssue): string {
  return `${issue.severity}|${issue.rule}|${issue.path}|${issue.line ?? ""}`;
}

export function projectFingerprint(files: GeneratedFile[]): string {
  return stableHash([...files]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((file) => `${file.path}\u0000${file.content}`)
    .join("\u0001"));
}

export class RoadmapRepairError extends Error {
  readonly attempt: RoadmapRepairAttempt;

  constructor(message: string, attempt: RoadmapRepairAttempt) {
    super(message);
    this.name = "RoadmapRepairError";
    this.attempt = attempt;
  }
}

function createFailedAttempt(
  fingerprint: string,
  category: RepairFailureCategory,
  reason: string,
  strategySummary?: string,
  differenceFromPrevious?: string,
): RoadmapRepairAttempt {
  return {
    id: `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    projectFingerprint: fingerprint,
    outcome: "failed",
    category,
    reason,
    strategySummary,
    differenceFromPrevious,
  };
}

function normalizedStrategy(value: string): string {
  return normalizeText(value).replace(/\s+/g, " ");
}

interface ProjectRepairResponse {
  files?: GeneratedFile[];
  deletePaths?: string[];
  repair?: {
    addressedFindingIds?: string[];
    changedPaths?: string[];
    manualFollowUps?: string[];
    status?: "applied" | "blocked";
    strategySummary?: string;
    differenceFromPrevious?: string;
    blockers?: RepairBlocker[];
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
  directives: string[] = [],
): Promise<RoadmapRepairResult> {
  if (!files.length) throw new Error("Hittade inga projektfiler att reparera.");
  const lintBefore = lintProject(files);
  const fingerprint = projectFingerprint(files);
  const attemptsOnThisCode = (step.attempts ?? []).filter((attempt) => attempt.projectFingerprint === fingerprint);
  const transientCount = attemptsOnThisCode.filter((attempt) => attempt.category === "transient").length;
  // A failure that keeps recurring on unchanged code is not transient, no matter how it is reported.
  const classify = (base: RepairFailureCategory): RepairFailureCategory =>
    base === "transient" && transientCount >= 1 ? "generation" : base;
  const previousAttempts = attemptsOnThisCode.filter((attempt) => classify(attempt.category ?? "generation") !== "transient");
  const activeDirectives = directives.filter((item) => item.trim().length > 0);

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
      previousAttempts,
      directives: activeDirectives,
    }),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ error: `Error ${resp.status}` }));
    const message = (data as { error?: string }).error || `Error ${resp.status}`;
    const category = classify(resp.status === 429 || resp.status >= 500 ? "transient" : "generation");
    throw new RoadmapRepairError(message, createFailedAttempt(fingerprint, category, message));
  }
  const text = await resp.text();
  let data: ProjectRepairResponse;
  try {
    data = JSON.parse(text.trim()) as ProjectRepairResponse;
  } catch {
    const message = "AI:n returnerade ett ogiltigt reparationssvar.";
    throw new RoadmapRepairError(message, createFailedAttempt(fingerprint, "invalid-response", message));
  }
  if (data.error) {
    const category = classify(/Rate limited|tillfäll|Kodgenereringen misslyckades/i.test(data.error) ? "transient" : "generation");
    throw new RoadmapRepairError(data.error, createFailedAttempt(fingerprint, category, data.error));
  }
  const strategySummary = data.repair?.strategySummary?.trim() ?? "";
  const differenceFromPrevious = data.repair?.differenceFromPrevious?.trim() ?? "";
  if (!strategySummary) {
    const message = "Reparationssvaret saknade en namngiven lösningsstrategi och avvisades.";
    throw new RoadmapRepairError(message, createFailedAttempt(fingerprint, "invalid-response", message));
  }
  const repeated = previousAttempts.some((attempt) =>
    attempt.strategySummary && normalizedStrategy(attempt.strategySummary) === normalizedStrategy(strategySummary)
  );
  if (repeated) {
    const message = "Reparationsförsöket upprepade en tidigare misslyckad strategi och avvisades innan kod kunde tillämpas.";
    throw new RoadmapRepairError(message, createFailedAttempt(fingerprint, "generation", message, strategySummary, differenceFromPrevious));
  }
  const changed = data.files ?? [];
  const deletePaths = (data.deletePaths ?? []).filter(
    (path) => typeof path === "string" && isSafeProjectPath(path) && files.some((file) => file.path === path),
  );
  const blockers = data.repair?.blockers ?? [];
  const impossible = invalidHostBlocker(blockers);
  if (impossible) {
    const message =
      `Blockeraren avvisades: "${impossible.requiredAction}" kräver en handling utanför bygget. ` +
      "Projektet är enbart en fillista som pushas till en tom mapp och kompileras med förinstallerad Gradle 8.7 — " +
      "radering sker genom deletePaths och någon Gradle wrapper används aldrig.";
    throw new RoadmapRepairError(
      message,
      createFailedAttempt(fingerprint, "generation", message, strategySummary, differenceFromPrevious),
    );
  }
  const isBlocked = data.repair?.status === "blocked";
  if (isBlocked && !blockers.length) {
    const message = "Etappen markerades blockerad utan en konkret blockerare eller nödvändig åtgärd.";
    throw new RoadmapRepairError(message, createFailedAttempt(fingerprint, "invalid-response", message, strategySummary, differenceFromPrevious));
  }
  if (!changed.length && !deletePaths.length && !isBlocked) {
    const message = "AI:n returnerade inga ändrade filer för etappen.";
    throw new RoadmapRepairError(message, createFailedAttempt(fingerprint, "generation", message, strategySummary, differenceFromPrevious));
  }
  if (changed.some((file) => !isSafeProjectPath(file.path) || typeof file.content !== "string")) {
    const message = "Reparationsbatchen innehöll en osäker eller ogiltig filsökväg och avvisades.";
    throw new RoadmapRepairError(message, createFailedAttempt(fingerprint, "invalid-response", message, strategySummary, differenceFromPrevious));
  }

  const merged = mergeFiles(files, changed, deletePaths);
  const lintAfter = lintProject(merged);
  const beforeKeys = new Set(lintBefore.map(lintKey));
  const introducedIssues = lintAfter.filter((issue) => !beforeKeys.has(lintKey(issue)));
  if (introducedIssues.length || lintAfter.length > lintBefore.length) {
    const reason = introducedIssues[0]?.message ?? "den statiska felbilden förvärrades";
    const message = `Batchen avvisades av regressionsskyddet: ${reason}. Ingen kod uppdaterades.`;
    throw new RoadmapRepairError(message, createFailedAttempt(fingerprint, "regression", message, strategySummary, differenceFromPrevious));
  }

  const status = isBlocked ? "blocked" : "applied";
  const attempt: RoadmapRepairAttempt = {
    id: `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    projectFingerprint: fingerprint,
    outcome: status,
    category: isBlocked ? "blocked" : undefined,
    strategySummary,
    differenceFromPrevious,
    blockers,
  };

  return {
    files: merged,
    changedPaths: [...changed.map((file) => file.path), ...deletePaths.map((path) => `${path} (raderad)`)],
    addressedFindingIds: data.repair?.addressedFindingIds ?? step.findingIds,
    manualFollowUps: data.repair?.manualFollowUps ?? [],
    lintBefore: lintBefore.length,
    lintAfter: lintAfter.length,
    status,
    strategySummary,
    differenceFromPrevious,
    blockers,
    attempt,
  };
}
