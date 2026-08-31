export interface GeneratedFile {
  path: string;
  content: string;
}

export type GenStageStatus = "pending" | "running" | "done" | "error";

export interface GenStage {
  id: string;
  label: string;
  status: GenStageStatus;
  error?: string;
}

export interface GeneratedProject {
  appName: string;
  packageName: string;
  files: GeneratedFile[];
  generatedAt: string;
}
