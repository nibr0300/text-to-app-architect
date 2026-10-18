import { AppSpec } from "@/types/appSpec";

// Builds the App Contract deterministically from the AppSpec — no AI call, no extra cost.
// The contract is the authoritative target state: screens, data, features and
// acceptance tests that the builder and reviewer must satisfy.

export interface AcceptanceTest {
  id: string;
  text: string;
  source: string; // which spec element the test was derived from
}

function deriveAcceptanceTests(spec: AppSpec): AcceptanceTest[] {
  const tests: AcceptanceTest[] = [];
  const launcher = spec.screens?.find((s) => s.isLauncher) ?? spec.screens?.[0];
  if (launcher) {
    tests.push({
      id: "AC-launch",
      text: `Appen startar på skärmen "${launcher.name}" utan krasch.`,
      source: `screen:${launcher.id}`,
    });
  }
  for (const screen of spec.screens ?? []) {
    tests.push({
      id: `AC-screen-${screen.id}`,
      text: `Skärmen "${screen.name}" renderar alla definierade komponenter (${(screen.components ?? [])
        .map((c) => c.type)
        .join(", ") || "layout"}).`,
      source: `screen:${screen.id}`,
    });
    for (const comp of screen.components ?? []) {
      for (const ev of comp.events ?? []) {
        tests.push({
          id: `AC-event-${screen.id}-${comp.id}-${ev.type}`,
          text: `På "${screen.name}": ${ev.type} på ${comp.id} utför "${ev.action}".`,
          source: `component:${comp.id}`,
        });
      }
    }
  }
  for (const nav of spec.navigation ?? []) {
    tests.push({
      id: `AC-nav-${nav.from}-${nav.to}`,
      text: `Navigering ${nav.from} → ${nav.to} fungerar via "${nav.trigger}".`,
      source: "navigation",
    });
  }
  for (const model of spec.dataModels ?? []) {
    tests.push({
      id: `AC-data-${model.name}`,
      text: `Datamodellen ${model.name} sparas och läses tillbaka med alla fält intakta.`,
      source: `dataModel:${model.name}`,
    });
  }
  for (const feature of spec.features ?? []) {
    tests.push({
      id: `AC-feature-${feature.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`,
      text: `Funktionen "${feature}" är implementerad med riktig logik (ej simulerad).`,
      source: "features",
    });
  }
  for (const api of spec.apis ?? []) {
    tests.push({
      id: `AC-api-${api.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`,
      text: `API-integrationen "${api.name}" anropar ${api.baseUrl} och hanterar felsvar.`,
      source: `api:${api.name}`,
    });
  }
  tests.push({
    id: "AC-build",
    text: "Projektet kompilerar med `gradle assembleDebug` utan fel och producerar en installerbar APK.",
    source: "build",
  });
  return tests;
}

function yamlEscape(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function buildContractYaml(spec: AppSpec): string {
  const lines: string[] = [];
  lines.push("# ============================================");
  lines.push("# APP CONTRACT — auktoritativ målbild");
  lines.push("# Genererad deterministiskt från AppSpec.");
  lines.push("# Byggaren och granskaren ska uppfylla detta.");
  lines.push("# ============================================");
  lines.push("");
  lines.push(`app:`);
  lines.push(`  name: ${yamlEscape(spec.appName)}`);
  lines.push(`  package: ${yamlEscape(spec.packageName)}`);
  lines.push(`  description: ${yamlEscape(spec.description)}`);
  lines.push("");
  lines.push("screens:");
  for (const s of spec.screens ?? []) {
    lines.push(`  - id: ${s.id}`);
    lines.push(`    name: ${yamlEscape(s.name)}`);
    lines.push(`    launcher: ${s.isLauncher}`);
    lines.push(`    layout: ${yamlEscape(s.layout)}`);
    lines.push(`    components:`);
    for (const c of s.components ?? []) {
      lines.push(`      - id: ${c.id}`);
      lines.push(`        type: ${yamlEscape(c.type)}`);
      if (c.events?.length) {
        lines.push(`        events:`);
        for (const ev of c.events) {
          lines.push(`          - { on: ${yamlEscape(ev.type)}, action: ${yamlEscape(ev.action)} }`);
        }
      }
    }
  }
  lines.push("");
  lines.push("navigation:");
  for (const n of spec.navigation ?? []) {
    lines.push(`  - { from: ${n.from}, to: ${n.to}, trigger: ${yamlEscape(n.trigger)} }`);
  }
  lines.push("");
  lines.push("data_models:");
  for (const m of spec.dataModels ?? []) {
    lines.push(`  - name: ${m.name}`);
    lines.push(`    fields:`);
    for (const f of m.fields ?? []) {
      lines.push(`      - { name: ${f.name}, type: ${yamlEscape(f.type)}, nullable: ${f.nullable} }`);
    }
  }
  lines.push("");
  if (spec.apis?.length) {
    lines.push("apis:");
    for (const a of spec.apis) {
      lines.push(`  - name: ${yamlEscape(a.name)}`);
      lines.push(`    base_url: ${yamlEscape(a.baseUrl)}`);
      lines.push(`    endpoints:`);
      for (const ep of a.endpoints ?? []) {
        lines.push(`      - { method: ${ep.method}, path: ${yamlEscape(ep.path)} }`);
      }
    }
    lines.push("");
  }
  if (spec.features?.length) {
    lines.push("features:");
    for (const f of spec.features) lines.push(`  - ${yamlEscape(f)}`);
    lines.push("");
  }
  if (spec.permissions?.length) {
    lines.push("permissions:");
    for (const p of spec.permissions) lines.push(`  - ${yamlEscape(p)}`);
    lines.push("");
  }
  lines.push("theme:");
  lines.push(`  primary: ${yamlEscape(spec.theme.primaryColor)}`);
  lines.push(`  secondary: ${yamlEscape(spec.theme.secondaryColor)}`);
  lines.push(`  font: ${yamlEscape(spec.theme.fontFamily)}`);
  lines.push(`  dark_mode: ${spec.theme.darkMode}`);
  lines.push("");
  lines.push("acceptance_tests:");
  for (const t of deriveAcceptanceTests(spec)) {
    lines.push(`  - id: ${t.id}`);
    lines.push(`    text: ${yamlEscape(t.text)}`);
    lines.push(`    source: ${t.source}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function getAcceptanceTests(spec: AppSpec): AcceptanceTest[] {
  return deriveAcceptanceTests(spec);
}
