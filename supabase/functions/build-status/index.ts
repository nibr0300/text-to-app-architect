import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import JSZip from "npm:jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GH = "https://api.github.com";

interface WorkflowRun {
  id: number;
  name?: string;
  display_title?: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
}

function ghHeaders(token: string) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "nlp-programmer",
  };
}

/** GitHub redirects binary downloads to storage; the auth header must not follow. */
async function downloadRedirect(url: string, token: string): Promise<Uint8Array> {
  const res = await fetch(url, { headers: ghHeaders(token), redirect: "manual" });
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location");
    if (!location) throw new Error("GitHub returnerade ingen nedladdningslänk.");
    const file = await fetch(location);
    if (!file.ok) throw new Error(`Nedladdning misslyckades [${file.status}].`);
    return new Uint8Array(await file.arrayBuffer());
  }
  if (!res.ok) throw new Error(`Nedladdning misslyckades [${res.status}].`);
  return new Uint8Array(await res.arrayBuffer());
}

function extractErrorLines(text: string): string[] {
  const lines = text.split("\n").map((l) => l.replace(/^\S+\s/, "").trimEnd());
  const interesting = lines.filter((l) =>
    /(^e: )|(error:)|(FAILURE:)|(Caused by:)|(Execution failed)|(Could not )|(Unresolved reference)|(Compilation error)/i.test(
      l,
    ),
  );
  const picked = interesting.length ? interesting : lines.slice(-80);
  return picked.slice(-120).filter(Boolean);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const token = Deno.env.get("APK_GITHUB_TOKEN");
    const owner = Deno.env.get("APK_GITHUB_OWNER");
    const repo = Deno.env.get("APK_GITHUB_REPO") ?? "nlp-programmer-builds";
    if (!token || !owner) return json({ error: "GitHub-anslutningen är inte konfigurerad." }, 400);

    const { buildId, action = "status" } = (await req.json().catch(() => ({}))) as {
      buildId?: string;
      action?: "status" | "artifact" | "logs";
    };
    if (!buildId || !/^[a-z0-9-]{3,80}$/.test(buildId)) return json({ error: "Ogiltigt bygg-id." }, 400);

    const base = `${GH}/repos/${owner}/${repo}`;

    const runsRes = await fetch(
      `${base}/actions/workflows/build.yml/runs?event=workflow_dispatch&per_page=40`,
      { headers: ghHeaders(token) },
    );
    if (runsRes.status === 404) {
      // Either the repo is unreachable (wrong owner/repo/token) or no build has been pushed yet.
      const repoRes = await fetch(base, { headers: ghHeaders(token) });
      if (!repoRes.ok) {
        return json(
          {
            error: `Kommer inte åt repot ${owner}/${repo} [${repoRes.status}]. Kontrollera användarnamn, repo-namn och att token har Contents + Actions + Workflows.`,
          },
          502,
        );
      }
      return json({ state: "queued", detail: "Byggflödet har inte registrerats hos GitHub än." });
    }
    if (!runsRes.ok) {
      const body = await runsRes.text();
      return json({ error: `Kunde inte läsa byggstatus [${runsRes.status}]: ${body.slice(0, 300)}` }, 502);
    }

    const runsData = (await runsRes.json()) as { workflow_runs: WorkflowRun[] };
    const wanted = `build-${buildId}`;
    const run = runsData.workflow_runs.find(
      (r) => r.display_title === wanted || r.name === wanted,
    );

    if (!run) {
      return json({ state: "queued", detail: "Bygget köar hos GitHub Actions." });
    }

    const state =
      run.status !== "completed"
        ? run.status === "queued" || run.status === "pending"
          ? "queued"
          : "building"
        : run.conclusion === "success"
          ? "success"
          : "failed";

    if (action === "status") {
      let artifactReady = false;
      if (state === "success") {
        const artRes = await fetch(`${base}/actions/runs/${run.id}/artifacts`, {
          headers: ghHeaders(token),
        });
        if (artRes.ok) {
          const arts = (await artRes.json()) as { artifacts: { name: string; expired: boolean }[] };
          artifactReady = arts.artifacts.some((a) => a.name === `apk-${buildId}` && !a.expired);
        }
      }
      return json({
        state,
        runId: run.id,
        runUrl: run.html_url,
        conclusion: run.conclusion,
        artifactReady,
      });
    }

    if (action === "artifact") {
      if (state !== "success") return json({ error: "Bygget är inte klart än." }, 409);
      const artRes = await fetch(`${base}/actions/runs/${run.id}/artifacts`, {
        headers: ghHeaders(token),
      });
      const arts = (await artRes.json()) as { artifacts: { id: number; name: string }[] };
      const artifact = arts.artifacts.find((a) => a.name === `apk-${buildId}`) ?? arts.artifacts[0];
      if (!artifact) return json({ error: "Ingen APK-artefakt hittades." }, 404);

      const zipBytes = await downloadRedirect(
        `${base}/actions/artifacts/${artifact.id}/zip`,
        token,
      );
      const zip = await JSZip.loadAsync(zipBytes);
      const apkEntry = Object.values(zip.files).find(
        (f: { name: string; dir: boolean }) => !f.dir && f.name.endsWith(".apk"),
      ) as { name: string; async: (t: string) => Promise<Uint8Array> } | undefined;
      if (!apkEntry) return json({ error: "Artefakten innehöll ingen .apk-fil." }, 404);

      const apkBytes = await apkEntry.async("uint8array");
      const fileName = apkEntry.name.split("/").pop() ?? `${buildId}.apk`;
      // Skicka rå binär (ingen base64-uppblåsning) så även stora APK:er går igenom.
      return new Response(apkBytes, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/vnd.android.package-archive",
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "X-Apk-File-Name": fileName,
          "Access-Control-Expose-Headers": "X-Apk-File-Name",
        },
      });
    }

    // action === "logs"
    if (run.status !== "completed") return json({ error: "Bygget pågår fortfarande." }, 409);
    const logBytes = await downloadRedirect(`${base}/actions/runs/${run.id}/logs`, token);
    const zip = await JSZip.loadAsync(logBytes);
    const texts: string[] = [];
    for (const file of Object.values(zip.files) as {
      name: string;
      dir: boolean;
      async: (t: string) => Promise<string>;
    }[]) {
      if (file.dir || !file.name.endsWith(".txt")) continue;
      texts.push(await file.async("string"));
    }
    const combined = texts.join("\n");
    return json({
      runUrl: run.html_url,
      lines: extractErrorLines(combined),
    });
  } catch (e) {
    console.error("build-status error:", e);
    return json({ error: e instanceof Error ? e.message : "Okänt fel." }, 500);
  }
});
