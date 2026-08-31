export type ReviewSeverity = "critical" | "major" | "minor" | "info";

export interface ReviewFinding {
  id: string;
  severity: ReviewSeverity;
  title: string;
  detail: string;
  paths: string[];
  suggestion?: string;
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
