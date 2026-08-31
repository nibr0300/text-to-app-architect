import { GeneratedFile } from "@/types/generatedProject";

export type LintSeverity = "error" | "warning";

export interface LintIssue {
  path: string;
  severity: LintSeverity;
  rule: string;
  message: string;
  line?: number;
}

/** Strips Kotlin string literals and comments so bracket counting is reliable. */
function stripKotlinNoise(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === '"' && src.slice(i, i + 3) === '"""') {
      i += 3;
      while (i < n && src.slice(i, i + 3) !== '"""') i++;
      i += 3;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\") i++;
        i++;
      }
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function balanceIssues(path: string, src: string): LintIssue[] {
  const clean = stripKotlinNoise(src);
  const pairs: [string, string, string][] = [
    ["{", "}", "klammerparenteser"],
    ["(", ")", "parenteser"],
    ["[", "]", "hakparenteser"],
  ];
  const issues: LintIssue[] = [];
  for (const [open, close, label] of pairs) {
    let depth = 0;
    let broke = false;
    for (const ch of clean) {
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth < 0) {
          broke = true;
          break;
        }
      }
    }
    if (broke || depth !== 0) {
      issues.push({
        path,
        severity: "error",
        rule: "unbalancedBrackets",
        message: `Obalanserade ${label} — filen kan inte kompilera.`,
      });
    }
  }
  return issues;
}

const STRAY_TOKEN = /^\s*[})\]]\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/;
const KOTLIN_KEYWORDS = new Set(["else", "catch", "finally", "while"]);

export function lintProject(files: GeneratedFile[]): LintIssue[] {
  const issues: LintIssue[] = [];

  for (const file of files) {
    const { path, content } = file;
    const isKotlin = path.endsWith(".kt");

    if (isKotlin) {
      issues.push(...balanceIssues(path, content));

      content.split("\n").forEach((line, idx) => {
        const m = line.match(STRAY_TOKEN);
        if (m && !KOTLIN_KEYWORDS.has(m[1])) {
          issues.push({
            path,
            severity: "error",
            rule: "strayToken",
            line: idx + 1,
            message: `Skräptoken "${m[1]}" efter blockslut på rad ${idx + 1}.`,
          });
        }
        if (/\bTODO\b|FIXME|<placeholder>|\.\.\./.test(line) && !line.includes("TODO(")) {
          if (/TODO|FIXME|<placeholder>/.test(line)) {
            issues.push({
              path,
              severity: "error",
              rule: "placeholder",
              line: idx + 1,
              message: `Ofullständig kod (TODO/FIXME) på rad ${idx + 1}.`,
            });
          }
        }
      });

      if (/\bstartScan\s*\(/.test(content) && !/ScanFilter/.test(content)) {
        issues.push({
          path,
          severity: "error",
          rule: "bleScanFilter",
          message:
            "BLE-scanning utan ScanFilter — kopplar mot första bästa enhet. Filtrera på tjänstens UUID.",
        });
      }

      if (
        /FusedLocationProviderClient/.test(content) &&
        !/GoogleApiAvailability|isGooglePlayServicesAvailable/.test(content)
      ) {
        issues.push({
          path,
          severity: "error",
          rule: "playServicesCheck",
          message:
            "FusedLocationProviderClient används utan kontroll av Google Play Services — kraschar på enheter utan GApps.",
        });
      }

      if (
        /setOnMenuItemClickListener/.test(content) &&
        !/inflateMenu|onCreateOptionsMenu|app:menu|R\.menu\./.test(content)
      ) {
        issues.push({
          path,
          severity: "error",
          rule: "toolbarMenu",
          message:
            "Toolbar-menylyssnare utan inflaterad meny — menyvalet går aldrig att klicka på.",
        });
      }

      if (/generateSynth|sin\s*\(\s*2\s*\*\s*Math\.PI|440(\.0)?f?\b/.test(content) && /Audio|Wav|WAV|Player/.test(path)) {
        issues.push({
          path,
          severity: "warning",
          rule: "syntheticAudio",
          message:
            "Ljudet genereras som en syntetisk ton istället för riktig musik — koppla mot en musikkälla eller en paketerad ljudresurs.",
        });
      }

      if (/roads\.googleapis\.com/.test(content)) {
        issues.push({
          path,
          severity: "warning",
          rule: "paidApi",
          message:
            "Google Roads API kräver separat aktivering och fakturering — behöver en fallback när svaret är 403/404.",
        });
      }

      if (/Bearer\s+\$\{?[A-Za-z_]*[Tt]oken/.test(content) && /spotify/i.test(content) && !/refresh_token|authorize/i.test(content)) {
        issues.push({
          path,
          severity: "warning",
          rule: "staticOAuthToken",
          message:
            "Spotify-anropen använder en statisk Bearer-token utan OAuth-flöde — token går ut efter en timme.",
        });
      }
    }
  }

  return issues;
}
