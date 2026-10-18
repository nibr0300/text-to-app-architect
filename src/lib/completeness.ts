import { DeterministicScore, ReviewFinding, ReviewReport, ScoreComponent } from "@/types/review";

/**
 * The completion figure shown to the user is computed from evidence, never estimated by a model:
 * the same report always produces the same number, so progress can be trusted before spending
 * more credits. The AI's own estimate is kept alongside it for comparison only.
 */
const WEIGHTS = { contract: 40, buildability: 30, findings: 30 } as const;

/** Points of evidence each finding type costs, out of FINDING_PENALTY_SCALE. */
const SEVERITY_PENALTY: Record<ReviewFinding["severity"], number> = {
  critical: 15,
  major: 6,
  minor: 1.5,
  info: 0,
};

const LINT_ERROR_COST = 0.2;
const LINT_WARNING_COST = 0.05;
const FINDING_PENALTY_SCALE = 60;
const COMPILE_CAP = 45;
const CRITICAL_CAP = 70;
const LINT_SECTION_ID = "lint";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Static-analysis counts: preferred from the stored summary, otherwise derived from the lint section. */
function lintCounts(report: ReviewReport): { errors: number; warnings: number } {
  if (report.lintSummary) {
    return { errors: report.lintSummary.errors, warnings: report.lintSummary.warnings };
  }
  const findings = report.sections.find((section) => section.id === LINT_SECTION_ID)?.findings ?? [];
  return {
    errors: findings.filter((finding) => finding.severity === "critical").length,
    warnings: findings.filter((finding) => finding.severity === "major").length,
  };
}

export function scoreReport(report: ReviewReport): DeterministicScore {
  const components: ScoreComponent[] = [];

  const tests = report.contractResults ?? [];
  const passed = tests.filter((test) => test.status === "pass").length;
  const failed = tests.filter((test) => test.status === "fail").length;
  const unverified = tests.filter((test) => test.status === "unknown").length;
  if (tests.length) {
    components.push({
      id: "contract",
      label: "Kontraktets acceptanstester",
      points: round1(WEIGHTS.contract * (passed / tests.length)),
      max: WEIGHTS.contract,
      detail: `${passed} klarade · ${failed} underkända · ${unverified} kunde inte verifieras`,
    });
  }

  const { errors, warnings } = lintCounts(report);
  const buildRatio = clamp01(1 - errors * LINT_ERROR_COST - warnings * LINT_WARNING_COST);
  components.push({
    id: "buildability",
    label: "Statisk analys (syntax, manifest, nycklar)",
    points: round1(WEIGHTS.buildability * buildRatio),
    max: WEIGHTS.buildability,
    detail: errors || warnings ? `${errors} fel · ${warnings} varningar` : "Inga avikelser",
  });

  const reviewed = report.sections
    .filter((section) => section.id !== LINT_SECTION_ID)
    .flatMap((section) => section.findings);
  const critical = reviewed.filter((finding) => finding.severity === "critical").length;
  const major = reviewed.filter((finding) => finding.severity === "major").length;
  const minor = reviewed.filter((finding) => finding.severity === "minor").length;
  const penalty = reviewed.reduce((sum, finding) => sum + (SEVERITY_PENALTY[finding.severity] ?? 0), 0);
  components.push({
    id: "findings",
    label: "AI-revisioner (arkitektur, funktionalitet, säkerhet, byggbarhet)",
    points: round1(WEIGHTS.findings * clamp01(1 - penalty / FINDING_PENALTY_SCALE)),
    max: WEIGHTS.findings,
    detail: `${critical} kritiska · ${major} allvarliga · ${minor} mindre`,
  });

  const gates: string[] = [];
  let cap = 100;
  if (errors) {
    cap = Math.min(cap, COMPILE_CAP);
    gates.push(`${errors} statiska fel blockerar bygget — poängen är takad till ${COMPILE_CAP}.`);
  }
  if (critical) {
    cap = Math.min(cap, CRITICAL_CAP);
    gates.push(`${critical} kritiska brister — poängen är takad till ${CRITICAL_CAP}.`);
  }

  const maxSum = components.reduce((sum, component) => sum + component.max, 0);
  const pointsSum = components.reduce((sum, component) => sum + component.points, 0);
  const score = Math.round(Math.min(cap, (100 * pointsSum) / maxSum));

  return {
    score,
    components,
    gates,
    basis: `Beräknad ur ${tests.length} acceptanstester, ${errors + warnings} statiska avikelser och ${reviewed.length} AI-funnelser.`,
  };
}
