import { describe, expect, it } from "vitest";
import { scoreReport } from "@/lib/completeness";
import { reviewInputKey } from "@/lib/reviewCodebase";
import { ContractTestResult, ReviewFinding, ReviewReport, ReviewSection } from "@/types/review";

const finding = (title: string, severity: ReviewFinding["severity"]): ReviewFinding => ({
  id: title,
  severity,
  title,
  detail: "Detalj",
  paths: ["app/src/main/A.kt"],
});

const section = (id: string, findings: ReviewFinding[]): ReviewSection => ({ id, title: id, findings });

const report = (overrides: Partial<ReviewReport> = {}): ReviewReport => ({
  completeness: 50,
  verdict: "",
  strengths: [],
  nextSteps: [],
  roadmap: [],
  sections: [section("lint", []), section("functionality", [])],
  generatedAt: new Date().toISOString(),
  source: "generated",
  fileCount: 1,
  ...overrides,
});

const tests = (passed: number, failed: number, unverified: number): ContractTestResult[] => [
  ...Array.from({ length: passed }, (_, i) => ({ id: `p${i}`, text: "t", status: "pass" as const, evidence: "" })),
  ...Array.from({ length: failed }, (_, i) => ({ id: `f${i}`, text: "t", status: "fail" as const, evidence: "" })),
  ...Array.from({ length: unverified }, (_, i) => ({ id: `u${i}`, text: "t", status: "unknown" as const, evidence: "" })),
];

describe("deterministic completion score", () => {
  it("credits only passed contract tests", () => {
    const result = scoreReport(report({ contractResults: tests(8, 0, 2) }));
    expect(result.components.find((c) => c.id === "contract")?.points).toBe(32);
    expect(result.score).toBe(92);
    expect(result.gates).toEqual([]);
  });

  it("caps the score at 45 when the static analysis finds compile-blocking errors", () => {
    const result = scoreReport(
      report({
        contractResults: tests(10, 0, 0),
        sections: [section("lint", [finding("Obalanserade klammerparenteser", "critical")]), section("functionality", [])],
      }),
    );
    expect(result.score).toBe(45);
    expect(result.gates[0]).toContain("takad till 45");
  });

  it("caps the score at 70 when a critical AI finding remains", () => {
    const result = scoreReport(
      report({
        contractResults: tests(10, 0, 0),
        sections: [section("lint", []), section("functionality", [finding("Kärnfunktionen är påhittad", "critical")])],
      }),
    );
    expect(result.components.find((c) => c.id === "findings")?.points).toBe(22.5);
    expect(result.score).toBe(70);
    expect(result.gates[0]).toContain("takad till 70");
  });

  it("renormalises to a full hundred when no contract exists", () => {
    expect(scoreReport(report({ source: "upload" })).score).toBe(100);
    const warned = scoreReport(report({ source: "upload", lintSummary: { errors: 0, warnings: 2 } }));
    expect(warned.components.map((c) => c.id)).toEqual(["buildability", "findings"]);
    expect(warned.score).toBe(95);
  });

  it("recomputes the same score from the same evidence", () => {
    const base = report({ contractResults: tests(6, 3, 1) });
    expect(scoreReport(base).score).toBe(scoreReport({ ...base, generatedAt: new Date(0).toISOString() }).score);
    expect(scoreReport(base).score).toBe(84);
  });
});

describe("review input key", () => {
  const files = [{ path: "app/A.kt", content: "class A" }];
  const base = reviewInputKey(files, null, [], "", "generated");

  it("is stable for identical inputs", () => {
    expect(reviewInputKey([...files], null, [], "", "generated")).toBe(base);
  });

  it("changes when code, directives, reference material or project source changes", () => {
    expect(reviewInputKey([{ path: "app/A.kt", content: "class B" }], null, [], "", "generated")).not.toBe(base);
    expect(reviewInputKey(files, null, ["Ta bort Spotify"], "", "generated")).not.toBe(base);
    expect(reviewInputKey(files, null, [], "lösning", "generated")).not.toBe(base);
    expect(reviewInputKey(files, null, [], "", "upload")).not.toBe(base);
  });
});
