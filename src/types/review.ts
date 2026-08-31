export type ReviewSeverity = "critical" | "major" | "minor" | "info";

export interface ReviewFinding {
  id: string;
  fingerprint?: string;
  severity: ReviewSeverity;
  title: string;
  detail: string;
  paths: string[];
  suggestion?: string;
}

export interface ReviewRoadmapStep {
  id: string;
  order: number;
  title: string;
  objective: string;
  rationale: string;
  findingIds: string[];
  paths: string[];
  dependsOn: string[];
  acceptanceCriteria: string[];
  status?: "pending" | "applied" | "verified" | "blocked";
}

export interface ReviewDelta {
  completeness: number;
  resolved: string[];
  remaining: string[];
  introduced: string[];
  critical: number;
  major: number;
}

export interface RoadmapRepairResult {
  files: import("@/types/generatedProject").GeneratedFile[];
  changedPaths: string[];
  addressedFindingIds: string[];
  manualFollowUps: string[];
  lintBefore: number;
  lintAfter: number;
}

export interface ReviewSection {
  id: string;
  title: string;
  summary?: string;
  findings: ReviewFinding[];
}

export interface ReviewReport {
  completeness: number;
  verdict: string;
  strengths: string[];
  nextSteps: string[];
  roadmap: ReviewRoadmapStep[];
  delta?: ReviewDelta;
  sections: ReviewSection[];
  generatedAt: string;
  source: "generated" | "upload";
  fileCount: number;
}

export type ReviewStageStatus = "pending" | "running" | "done" | "error";

export interface ReviewStage {
  id: string;
  label: string;
  status: ReviewStageStatus;
  error?: string;
}
