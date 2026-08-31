import { describe, expect, it } from "vitest";
import { compareReports, findingFingerprint } from "@/lib/reviewCodebase";
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
});