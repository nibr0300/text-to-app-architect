import { GeneratedFile } from "@/types/generatedProject";

const ALLOWED_EXT = [
  ".kt",
  ".java",
  ".xml",
  ".gradle",
  ".kts",
  ".pro",
  ".json",
  ".md",
  ".properties",
  ".yml",
  ".yaml",
];

const IGNORED_SEGMENTS = [
  "/build/",
  "/.git/",
  "/.gradle/",
  "/.idea/",
  "/node_modules/",
  "/captures/",
];

/** Max characters of source we keep — keeps AI payloads inside model limits. */
export const MAX_TOTAL_CHARS = 400_000;
export const MAX_FILE_CHARS = 60_000;
export const MAX_ZIP_BYTES = 25 * 1024 * 1024;

export interface ImportResult {
  files: GeneratedFile[];
  skipped: number;
  truncated: boolean;
}

function isAllowed(path: string): boolean {
  const p = `/${path}`;
  if (IGNORED_SEGMENTS.some((seg) => p.includes(seg))) return false;
  if (path.split("/").pop()?.startsWith(".")) return false;
  return ALLOWED_EXT.some((ext) => path.toLowerCase().endsWith(ext));
}

/** Removes a single common root folder so paths look like app/src/... */
function stripCommonRoot(files: GeneratedFile[]): GeneratedFile[] {
  if (files.length === 0) return files;
  const first = files[0].path.split("/")[0];
  if (!first) return files;
  const shared = files.every((f) => f.path.startsWith(`${first}/`));
  if (!shared) return files;
  return files.map((f) => ({ ...f, path: f.path.slice(first.length + 1) }));
}

export async function importProjectZip(file: File): Promise<ImportResult> {
  if (file.size > MAX_ZIP_BYTES) {
    throw new Error(
      `ZIP-filen är ${(file.size / 1024 / 1024).toFixed(1)} MB — max ${MAX_ZIP_BYTES / 1024 / 1024} MB.`,
    );
  }

  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file);

  const entries = Object.values(zip.files).filter((e) => !e.dir);
  let skipped = 0;
  let total = 0;
  let truncated = false;
  const out: GeneratedFile[] = [];

  for (const entry of entries) {
    if (!isAllowed(entry.name)) {
      skipped++;
      continue;
    }
    let content = await entry.async("string");
    if (content.length > MAX_FILE_CHARS) {
      content = `${content.slice(0, MAX_FILE_CHARS)}\n// … filen förkortad för granskning`;
      truncated = true;
    }
    if (total + content.length > MAX_TOTAL_CHARS) {
      truncated = true;
      skipped++;
      continue;
    }
    total += content.length;
    out.push({ path: entry.name, content });
  }

  if (out.length === 0) {
    throw new Error("Hittade ingen källkod i ZIP-filen (.kt, .java, .xml, .gradle.kts …).");
  }

  return {
    files: stripCommonRoot(out).sort((a, b) => a.path.localeCompare(b.path)),
    skipped,
    truncated,
  };
}
