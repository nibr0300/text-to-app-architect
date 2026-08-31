import { AppSpec, Screen } from "@/types/appSpec";
import { BuildContract, GeneratedFile, QualityReport } from "@/types/generatedProject";
import { LintIssue, lintProject } from "@/lib/lintProject";

const CODE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-code`;

type Stage = "contract" | "skeleton" | "screen" | "data" | "integrate" | "review" | "repair";

interface StageResponse {
  files: GeneratedFile[];
  contract: BuildContract | null;
  report: QualityReport | null;
}

async function callStage(payload: {
  stage: Stage;
  spec: AppSpec;
  screen?: Screen;
  files?: GeneratedFile[];
  contract?: BuildContract | null;
  issues?: LintIssue[];
}): Promise<StageResponse> {

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

  const text = await resp.text();
  let data: { files?: GeneratedFile[]; contract?: BuildContract; report?: QualityReport; error?: string };
  try {
    data = JSON.parse(text.trim());
  } catch {
    throw new Error("Ogiltigt svar från servern.");
  }
  if (data.error) throw new Error(data.error);
  return {
    files: (data.files ?? []) as GeneratedFile[],
    contract: (data.contract ?? null) as BuildContract | null,
    report: (data.report ?? null) as QualityReport | null,
  };

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
  onReport?: (report: QualityReport) => void;
}

export function planStages(spec: AppSpec) {
  return [
    { id: "contract", label: "Byggkontrakt (klasser, ägarskap, bibliotek)" },
    { id: "skeleton", label: "Projektskelett (Gradle, manifest, tema)" },
    ...(spec.screens ?? []).map((s) => ({ id: `screen:${s.id}`, label: `Skärm: ${s.name}` })),
    { id: "data", label: "Datamodeller & nätverkslager" },
    { id: "integrate", label: "Integrationsgranskning (död kod, placebo-logik, säkerhet)" },
    { id: "review", label: "Kompileringsgranskning & korrigering" },
    { id: "repair", label: "Statisk analys & reparation (syntax, BLE, Play Services, meny)" },
  ];
}


export interface GenerateProjectResult {
  files: GeneratedFile[];
  contract: BuildContract | null;
  report: QualityReport | null;
}

export async function generateProject(
  spec: AppSpec,
  cb: GenerateProjectCallbacks,
): Promise<GenerateProjectResult> {
  let all: GeneratedFile[] = [];
  let contract: BuildContract | null = null;
  let report: QualityReport | null = null;

  const run = async (id: string, fn: () => Promise<StageResponse>) => {
    cb.onStageStart(id);
    try {
      const res = await fn();
      if (res.contract) contract = res.contract;
      if (res.report) {
        report = {
          checks: [...(report?.checks ?? []), ...(res.report.checks ?? [])],
          manualFollowUps: [
            ...(report?.manualFollowUps ?? []),
            ...(res.report.manualFollowUps ?? []),
          ],
        };
        cb.onReport?.(report);
      }
      all = merge(all, res.files);
      cb.onStageDone(id, res.files, all);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Okänt fel";
      cb.onStageError(id, msg);
      throw e;
    }
  };

  await run("contract", () => callStage({ stage: "contract", spec }));
  await run("skeleton", () => callStage({ stage: "skeleton", spec, contract }));

  for (const screen of spec.screens ?? []) {
    await run(`screen:${screen.id}`, () => callStage({ stage: "screen", spec, screen, contract }));
  }

  await run("data", () => callStage({ stage: "data", spec, contract }));
  await run("integrate", () => callStage({ stage: "integrate", spec, files: all, contract }));
  await run("review", () => callStage({ stage: "review", spec, files: all, contract }));

  // Deterministic static analysis: only what the analyzer flags is sent back to the model.
  await run("repair", async () => {
    let issues = lintProject(all);
    let last: StageResponse = { files: [], contract: null, report: null };

    for (let attempt = 0; attempt < 2 && issues.length > 0; attempt++) {
      const affected = new Set(issues.map((i) => i.path));
      const res = await callStage({
        stage: "repair",
        spec,
        contract,
        issues,
        files: all.filter((f) => affected.has(f.path)),
      });
      all = merge(all, res.files);
      last = res;
      issues = lintProject(all);
    }

    const checks = [...(last.report?.checks ?? [])];
    if (issues.length === 0) {
      checks.push({
        id: "staticAnalysis",
        label: "Statisk analys",
        status: "ok",
        detail: "Inga syntaxfel, oskyddade Play Services-anrop, ofiltrerade BLE-scan eller ej inflaterade menyer kvar.",
      });
    } else {
      for (const issue of issues) {
        checks.push({
          id: issue.rule,
          label: `${issue.path.split("/").pop()} — ${issue.rule}`,
          status: "warning",
          detail: issue.message,
        });
      }
    }

    return { files: [], contract: null, report: { ...last.report, checks } };
  });

  return { files: all, contract, report };
}


export async function regenerateFile(
  spec: AppSpec,
  file: GeneratedFile,
  all: GeneratedFile[],
  contract?: BuildContract | null,
): Promise<GeneratedFile[]> {
  const screenMatch = (spec.screens ?? []).find(
    (s) =>
      file.path.includes(`activity_${s.id}.xml`) ||
      file.path.toLowerCase().includes(`${s.name.replace(/\s+/g, "").toLowerCase()}activity`),
  );
  if (screenMatch) {
    return (await callStage({ stage: "screen", spec, screen: screenMatch, contract })).files;
  }
  if (file.path.endsWith(".gradle.kts") || file.path.includes("AndroidManifest") || file.path.includes("res/values")) {
    return (await callStage({ stage: "skeleton", spec, contract })).files;
  }
  return (await callStage({ stage: "data", spec, files: all, contract })).files;
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
