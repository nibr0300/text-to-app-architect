import { describe, expect, it } from "vitest";
import { carryOverAttempts, compareReports, findingFingerprint, hasRepairExperience, projectFingerprint } from "@/lib/reviewCodebase";
import { ReviewFinding, ReviewReport } from "@/types/review";

const finding = (title: string, severity: ReviewFinding["severity"]): ReviewFinding => ({
  id: title,
  severity,
  title,
  detail: "Detalj",
  paths: ["app/src/main/Test.kt"],
});

const report = (completeness: number, findings: ReviewFinding[]): ReviewReport => ({
  completeness,
  verdict: "",
  strengths: [],
  nextSteps: [],
  roadmap: [],
  sections: [{ id: "test", title: "Test", findings }],
  generatedAt: new Date().toISOString(),
  source: "generated",
  fileCount: 1,
});

describe("review progression", () => {
  it("uses stable finding fingerprints independent of generated ids", () => {
    expect(findingFingerprint({ ...finding("Saknad meny", "major"), id: "first" }))
      .toBe(findingFingerprint({ ...finding("Saknad meny", "major"), id: "second" }));
  });

  it("tracks resolved and introduced findings between reviews", () => {
    const oldFinding = finding("Saknad meny", "major");
    const newFinding = finding("Saknad resurs", "critical");
    const delta = compareReports(report(65, [oldFinding]), report(50, [newFinding]));

    expect(delta?.completeness).toBe(15);
    expect(delta?.resolved).toHaveLength(1);
    expect(delta?.introduced).toHaveLength(1);
    expect(delta?.critical).toBe(-1);
    expect(delta?.major).toBe(1);
  });

  it("changes the project fingerprint only when project contents change", () => {
    const files = [{ path: "app/A.kt", content: "class A" }, { path: "app/B.kt", content: "class B" }];
    expect(projectFingerprint(files)).toBe(projectFingerprint([...files].reverse()));
    expect(projectFingerprint(files)).not.toBe(projectFingerprint([{ ...files[0], content: "class Changed" }, files[1]]));
  });
});
describe("process audit inputs", () => {
  const step = (id: string, attempts: number) => ({
    id,
    order: 1,
    title: id,
    objective: "",
    rationale: "",
    findingIds: [],
    paths: [],
    dependsOn: [],
    acceptanceCriteria: [],
    attempts: Array.from({ length: attempts }, (_, i) => ({
      id: `${id}-${i}`,
      at: new Date().toISOString(),
      projectFingerprint: "abc",
      outcome: "failed" as const,
      strategySummary: `strategi ${i}`,
    })),
  });

  it("only triggers the process audit when attempts exist", () => {
    expect(hasRepairExperience([step("a", 0)])).toBe(false);
    expect(hasRepairExperience([step("a", 0), step("b", 2)])).toBe(true);
  });

  it("keeps failed strategies blocked when a stage id reappears in a new roadmap", () => {
    const carried = carryOverAttempts([step("a", 0)], [step("a", 3), step("b", 1)]);
    expect(carried[0].attempts).toHaveLength(3);
  });
});
