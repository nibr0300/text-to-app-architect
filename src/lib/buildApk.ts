import { GeneratedFile } from "@/types/generatedProject";

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export type ApkBuildState = "idle" | "pushing" | "queued" | "building" | "success" | "failed";

export interface StartBuildResult {
  buildId: string;
  projectPath: string;
  repoUrl: string;
  fileCount: number;
}

export interface BuildStatus {
  state: Exclude<ApkBuildState, "idle" | "pushing">;
  runId?: number;
  runUrl?: string;
  conclusion?: string | null;
  artifactReady?: boolean;
  detail?: string;
}

async function call<T>(fn: string, body: unknown): Promise<T> {
  const resp = await fetch(`${BASE}/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let data: { error?: string } & Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Ogiltigt svar från servern (${resp.status}).`);
  }
  if (data.error) throw new Error(String(data.error));
  if (!resp.ok) throw new Error(`Fel ${resp.status}`);
  return data as T;
}

export async function startApkBuild(
  appName: string,
  files: GeneratedFile[],
): Promise<StartBuildResult> {
  return await call<StartBuildResult>("build-apk", { appName, files });
}

export async function getBuildStatus(buildId: string): Promise<BuildStatus> {
  return await call<BuildStatus>("build-status", { buildId, action: "status" });
}

export async function getBuildLogs(buildId: string): Promise<{ lines: string[]; runUrl?: string }> {
  return await call<{ lines: string[]; runUrl?: string }>("build-status", {
    buildId,
    action: "logs",
  });
}

export async function downloadApk(buildId: string): Promise<{ fileName: string; sizeBytes: number }> {
  const result = await call<{ fileName: string; sizeBytes: number; base64: string }>(
    "build-status",
    { buildId, action: "artifact" },
  );

  const binary = atob(result.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const blob = new Blob([bytes], { type: "application/vnd.android.package-archive" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = result.fileName || `${buildId}.apk`;
  link.click();
  URL.revokeObjectURL(url);

  return { fileName: result.fileName, sizeBytes: result.sizeBytes };
}
