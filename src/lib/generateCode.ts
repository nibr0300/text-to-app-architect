import { AppSpec, Screen } from "@/types/appSpec";
import { GeneratedFile } from "@/types/generatedProject";

const CODE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-code`;

type Stage = "skeleton" | "screen" | "data" | "review";

async function callStage(payload: {
  stage: Stage;
  spec: AppSpec;
  screen?: Screen;
  files?: GeneratedFile[];
}): Promise<GeneratedFile[]> {
  const resp = await fetch(CODE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ error: `Error ${resp.status}` }));
    throw new Error(data.error || `Error ${resp.status}`);
  }

  const data = await resp.json();
  return (data.files ?? []) as GeneratedFile[];
}

function merge(existing: GeneratedFile[], incoming: GeneratedFile[]): GeneratedFile[] {
  const map = new Map(existing.map((f) => [f.path, f]));
  for (const f of incoming) map.set(f.path, f);
  return Array.from(map.values()).sort((a, b) => a.path.localeCompare(b.path));
}

export interface GenerateProjectCallbacks {
  onStageStart: (id: string) => void;
  onStageDone: (id: string, files: GeneratedFile[], all: GeneratedFile[]) => void;
  onStageError: (id: string, error: string) => void;
}

export function planStages(spec: AppSpec) {
  return [
    { id: "skeleton", label: "Projektskelett (Gradle, manifest, tema)" },
    ...(spec.screens ?? []).map((s) => ({ id: `screen:${s.id}`, label: `Skärm: ${s.name}` })),
    { id: "data", label: "Datamodeller & nätverkslager" },
    { id: "review", label: "Granskning & korrigering" },
  ];
}

export async function generateProject(
  spec: AppSpec,
  cb: GenerateProjectCallbacks,
): Promise<GeneratedFile[]> {
  let all: GeneratedFile[] = [];

  const run = async (id: string, fn: () => Promise<GeneratedFile[]>) => {
    cb.onStageStart(id);
    try {
      const files = await fn();
      all = merge(all, files);
      cb.onStageDone(id, files, all);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Okänt fel";
      cb.onStageError(id, msg);
      throw e;
    }
  };

  await run("skeleton", () => callStage({ stage: "skeleton", spec }));

  for (const screen of spec.screens ?? []) {
    await run(`screen:${screen.id}`, () => callStage({ stage: "screen", spec, screen }));
  }

  await run("data", () => callStage({ stage: "data", spec }));
  await run("review", () => callStage({ stage: "review", spec, files: all }));

  return all;
}

export async function regenerateFile(
  spec: AppSpec,
  file: GeneratedFile,
  all: GeneratedFile[],
): Promise<GeneratedFile[]> {
  const screenMatch = (spec.screens ?? []).find(
    (s) =>
      file.path.includes(`activity_${s.id}.xml`) ||
      file.path.toLowerCase().includes(`${s.name.replace(/\s+/g, "").toLowerCase()}activity`),
  );
  if (screenMatch) return callStage({ stage: "screen", spec, screen: screenMatch });
  if (file.path.endsWith(".gradle.kts") || file.path.includes("AndroidManifest") || file.path.includes("res/values")) {
    return callStage({ stage: "skeleton", spec });
  }
  return callStage({ stage: "data", spec, files: all });
}

export async function downloadProjectZip(
  appName: string,
  files: GeneratedFile[],
): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const root = appName.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "android-app";
  for (const f of files) zip.file(`${root}/${f.path}`, f.content);

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${root}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
