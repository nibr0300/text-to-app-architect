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

export interface ContractClass {
  fqcn: string;
  kind: string;
  responsibility: string;
  publicApi?: string[];
}

export interface ContractFeatureOwner {
  feature: string;
  ownerClass: string;
  implementation: string;
}

export interface ContractLibrary {
  gradle: string;
  usedBy: string[];
  why?: string;
}

export interface ContractScreenWiring {
  screenId: string;
  activity: string;
  calls?: string[];
  navigatesTo?: string[];
  reachableFrom?: string[];
}

export interface BuildContract {
  uiLanguage?: string;
  classes?: ContractClass[];
  featureOwners?: ContractFeatureOwner[];
  libraries?: ContractLibrary[];
  screenWiring?: ContractScreenWiring[];
  settingsAccess?: string;
  notes?: string[];
}

export type QualityCheckStatus = "ok" | "fixed" | "warning";

export interface QualityCheck {
  id: string;
  label: string;
  status: QualityCheckStatus;
  detail?: string;
}

export interface QualityReport {
  checks: QualityCheck[];
  manualFollowUps?: string[];
}

export interface GeneratedProject {
  appName: string;
  packageName: string;
  files: GeneratedFile[];
  generatedAt: string;
  contract?: BuildContract | null;
  report?: QualityReport | null;
}
