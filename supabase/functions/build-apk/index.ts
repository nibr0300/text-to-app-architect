import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GH = "https://api.github.com";

const WORKFLOW_PATH = ".github/workflows/build.yml";

const WORKFLOW_YML = `name: Build APK
run-name: build-\${{ inputs.build_id }}

on:
  workflow_dispatch:
    inputs:
      project_path:
        description: Path to the Android project inside this repo
        required: true
      build_id:
        description: Unique id for this build
        required: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'

      - name: Set up Android SDK
        uses: android-actions/setup-android@v3

      - name: Set up Gradle
        uses: gradle/actions/setup-gradle@v4
        with:
          gradle-version: '8.7'

      - name: Build debug APK
        working-directory: \${{ inputs.project_path }}
        run: gradle assembleDebug --no-daemon --stacktrace

      - name: Upload APK
        if: success()
        uses: actions/upload-artifact@v4
        with:
          name: apk-\${{ inputs.build_id }}
          path: \${{ inputs.project_path }}/app/build/outputs/apk/debug/*.apk
          if-no-files-found: error
`;

interface IncomingFile {
  path: string;
  content: string;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "app"
  );
}

function sanitizePath(path: string): string | null {
  const clean = path.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!clean || clean.includes("..") || clean.length > 400) return null;
  if (clean.startsWith(".github/")) return null;
  return clean;
}

class GitHubClient {
  constructor(
    private token: string,
    private owner: string,
    private repo: string,
  ) {}

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const url = path.startsWith("http") ? path : `${GH}/repos/${this.owner}/${this.repo}${path}`;
    return await fetch(url, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "nlp-programmer",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
  }

  async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.request(path, init);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub ${init.method ?? "GET"} ${path} misslyckades [${res.status}]: ${body.slice(0, 400)}`);
    }
    return (await res.json()) as T;
  }
}

async function pushProject(
  gh: GitHubClient,
  buildId: string,
  files: IncomingFile[],
): Promise<{ commitSha: string; projectPath: string }> {
  const repoInfo = await gh.json<{ default_branch: string }>("");
  const branch = repoInfo.default_branch || "main";
  const ref = await gh.json<{ object: { sha: string } }>(`/git/ref/heads/${branch}`);
  const headSha = ref.object.sha;
  const headCommit = await gh.json<{ tree: { sha: string } }>(`/git/commits/${headSha}`);

  const projectPath = `builds/${buildId}`;

  const entries: IncomingFile[] = [{ path: WORKFLOW_PATH, content: WORKFLOW_YML }];
  for (const file of files) {
    const clean = sanitizePath(file.path);
    if (!clean) continue;
    entries.push({ path: `${projectPath}/${clean}`, content: file.content });
  }

  // Create blobs with limited concurrency so we do not hammer the API.
  const tree: { path: string; mode: "100644"; type: "blob"; sha: string }[] = [];
  const queue = [...entries];
  const workers = Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (!item) break;
      const blob = await gh.json<{ sha: string }>("/git/blobs", {
        method: "POST",
        body: JSON.stringify({ content: item.content, encoding: "utf-8" }),
      });
      tree.push({ path: item.path, mode: "100644", type: "blob", sha: blob.sha });
    }
  });
  await Promise.all(workers);

  const newTree = await gh.json<{ sha: string }>("/git/trees", {
    method: "POST",
    body: JSON.stringify({ base_tree: headCommit.tree.sha, tree }),
  });

  const commit = await gh.json<{ sha: string }>("/git/commits", {
    method: "POST",
    body: JSON.stringify({
      message: `NLP Programmer build ${buildId}`,
      tree: newTree.sha,
      parents: [headSha],
    }),
  });

  await gh.json(`/git/refs/heads/${branch}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });

  // Dispatch the workflow on the branch that now contains both project and workflow.
  // A freshly committed workflow can take a few seconds to register, so retry 404s.
  let lastError = "";
  for (let attempt = 0; attempt < 6; attempt++) {
    const dispatch = await gh.request("/actions/workflows/build.yml/dispatches", {
      method: "POST",
      body: JSON.stringify({
        ref: branch,
        inputs: { project_path: projectPath, build_id: buildId },
      }),
    });
    if (dispatch.ok) {
      lastError = "";
      break;
    }
    lastError = `[${dispatch.status}] ${(await dispatch.text()).slice(0, 300)}`;
    if (dispatch.status !== 404) break;
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }
  if (lastError) throw new Error(`Kunde inte starta bygget: ${lastError}`);


  return { commitSha: commit.sha, projectPath };
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
    if (!token || !owner) {
      return json({ error: "GitHub-anslutningen är inte konfigurerad." }, 400);
    }

    const body = (await req.json().catch(() => ({}))) as {
      files?: IncomingFile[];
      appName?: string;
    };
    const files = (body.files ?? []).filter(
      (f) => f && typeof f.path === "string" && typeof f.content === "string",
    );
    if (!files.length) return json({ error: "Inga projektfiler att bygga." }, 400);
    if (files.length > 600) return json({ error: "För många filer i projektet (max 600)." }, 400);

    const totalBytes = files.reduce((sum, f) => sum + f.content.length, 0);
    if (totalBytes > 8_000_000) return json({ error: "Projektet är för stort (max 8 MB text)." }, 400);

    const gh = new GitHubClient(token, owner, repo);
    const buildId = `${slugify(body.appName ?? "android-app")}-${Date.now()}`;

    const { commitSha, projectPath } = await pushProject(gh, buildId, files);

    return json({
      buildId,
      projectPath,
      commitSha,
      repoUrl: `https://github.com/${owner}/${repo}`,
      fileCount: files.length,
    });
  } catch (e) {
    console.error("build-apk error:", e);
    return json({ error: e instanceof Error ? e.message : "Okänt fel vid APK-bygge." }, 500);
  }
});
