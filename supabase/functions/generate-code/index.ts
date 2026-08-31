import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE_RULES = `You are a senior Android engineer. You generate production-quality Kotlin + XML for a native Android app from a JSON app specification.

Global conventions (ALWAYS follow):
- Kotlin, minSdk 24, targetSdk 34, AGP 8.x, Gradle Kotlin DSL (build.gradle.kts).
- ViewBinding for all layouts (no findViewById, no Compose).
- Retrofit 2 + Gson + OkHttp for network, coroutines (lifecycleScope) for async work.
- Every screen id maps to: res/layout/activity_<screen_id>.xml and an Activity class named from the screen name in PascalCase + "Activity".
- Accessibility first: large text sizes, contentDescription on every non-text view, high contrast, TalkBack friendly.
- No TODOs, no placeholder comments — write complete, compilable code.

HARD QUALITY RULES (a violation makes the output unacceptable):
1. NO PLACEBO LOGIC. Every feature in the spec must be implemented against a real platform or network API. Never simulate data with hardcoded lists, random values, timers pretending to be sensors, or a Toast/label where a real call belongs. If a value comes from the device, read it from the device.
2. NO UNUSED DEPENDENCIES. A Gradle dependency may only be declared if generated Kotlin code actually imports and uses it. Conversely, every capability implied by the spec must have its dependency declared.
3. MODERN PLATFORM APIs, explicitly:
   - Location: com.google.android.gms.location.FusedLocationProviderClient with LocationRequest/LocationCallback — never LocationManager.
   - Camera / vision (face detection, barcode scanning, OCR): CameraX Preview + ImageAnalysis feeding an ML Kit detector — never a stub switch.
   - Audio/music control: AudioManager, MediaSession/MediaController (androidx.media3.session) or PlaybackParams on the player — an app that changes tempo/pitch must actually act on audio playback.
   - Permissions: registerForActivityResult(ActivityResultContracts.RequestPermission(s)) — never onRequestPermissionsResult.
4. SINGLE SOURCE OF TRUTH FOR SETTINGS. All reads/writes of user settings go through the generated PreferencesStore. No Activity may touch SharedPreferences directly.
5. LANGUAGE CONSISTENCY. Derive one UI language from the spec (its description/screen names). TTS Locale, all user-visible strings, strings.xml and spoken announcements must all use that same language. Never mix a Swedish TTS locale with English strings.
6. RELEASE SAFETY. HttpLoggingInterceptor may only be added when BuildConfig.DEBUG is true, at Level.BODY in debug and NONE otherwise. Release build type: isMinifyEnabled = true with working proguard-rules.pro. Never hardcode API keys — read them from local.properties via buildConfigField and reference BuildConfig.
7. FULL NAVIGATION. Every generated Activity must be reachable from at least one other screen through a real Intent. If navigation goes through a Toolbar menu, you MUST also generate res/menu/<name>.xml AND inflate it (onCreateOptionsMenu or toolbar.inflateMenu / app:menu in the layout) — a setOnMenuItemClickListener without an inflated menu is a bug.
8. NO DEAD CODE. Every generated data class, service, repository and helper must be referenced somewhere in the app.
9. DEFENSIVE PLATFORM CALLS. Google Play Services APIs (FusedLocationProviderClient, ML Kit via GMS) must be guarded with GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) and degrade gracefully with a user-visible message instead of crashing. BLE scanning must use ScanFilter with the relevant service UUID (e.g. 0x180D for heart rate) — never connect to the first device found. Every network call needs an error path shown in the UI.
10. NO SYNTHETIC STAND-INS FOR REAL MEDIA. Never generate audio by writing WAV headers/sine tones, never fabricate images or data. Audio playback must come from a real source: the device's own media session (MediaController/AudioManager), a user-picked file (ActivityResultContracts.OpenDocument / MediaStore), or a bundled res/raw resource the README tells the developer to supply.
11. AUTH FLOWS MUST BE REAL. Third-party APIs that need OAuth (Spotify etc.) require the actual authorization + token-refresh flow, not a hardcoded Bearer token. If a provider appears in the UI (a spinner option, a button) it must be implemented — otherwise do not offer it.
12. AVOID PAID/RESTRICTED APIs unless the spec demands them. If one is unavoidable (Google Roads Speed Limits), implement a documented fallback path and list the required billing activation in manualFollowUps and the README.
13. LANGUAGE FIDELITY. The UI language is the language the user wrote the spec in. Never silently switch the whole app to English. TTS locale, SpeechRecognizer language, strings.xml and all announcements use that one language.
14. COMPILABLE OUTPUT. Balanced braces/parens, no stray tokens, no truncated files, no TODO/FIXME. Re-read each file before returning it.

OUTPUT FORMAT (strict): return ONLY a JSON object, no markdown fences:
{"files":[{"path":"relative/path/from/project/root","content":"full file content"}]}`;


const STAGE_PROMPTS: Record<string, string> = {
  contract: `Do NOT generate any files in this stage. Produce the BUILD CONTRACT that every later stage must obey.

Return ONLY this JSON shape (no "files" key):
{"contract":{
  "uiLanguage":"BCP47 tag derived from the spec, e.g. sv-SE",
  "classes":[{"fqcn":"pkg.layer.Name","kind":"activity|data|service|repository|store|util","responsibility":"one line","publicApi":["fun name(args): ReturnType"]}],
  "featureOwners":[{"feature":"from spec features","ownerClass":"fqcn","implementation":"the concrete real API used, e.g. CameraX ImageAnalysis + ML Kit FaceDetection"}],
  "libraries":[{"gradle":"group:artifact","usedBy":["fqcn"],"why":"one line"}],
  "screenWiring":[{"screenId":"id","activity":"fqcn","calls":["Repository.method()"],"navigatesTo":["fqcn"],"reachableFrom":["fqcn or LAUNCHER"]}],
  "settingsAccess":"pkg.data.PreferencesStore",
  "notes":["decisions later stages must follow"]
}}

Rules: no library without a usedBy entry; every feature in the spec needs a featureOwner with a REAL implementation (never "simulated"); every screen must appear in reachableFrom of some other screen or be the LAUNCHER; every API in the spec must be called by at least one screen.`,
  skeleton: `Generate the project skeleton ONLY:
- settings.gradle.kts, build.gradle.kts (root), app/build.gradle.kts (viewBinding + buildConfig on, exactly the dependencies listed in the contract's libraries array, debug/release build types per the release-safety rule, API keys via local.properties + buildConfigField), gradle.properties, app/proguard-rules.pro, .gitignore, README.md explaining required local.properties keys
- app/src/main/AndroidManifest.xml registering EVERY screen as an activity (launcher screen gets the LAUNCHER intent-filter) and declaring all permissions from the spec
- app/src/main/res/values/colors.xml, strings.xml (in the contract's uiLanguage), themes.xml (Material3 dark theme using the spec theme colors)
Do NOT generate activities, layouts, models or network code in this stage.`,
  screen: `Generate EXACTLY two files for the single screen given below:
- app/src/main/res/layout/activity_<screen_id>.xml using the screen's layout root and all its components (ids from the spec, properties applied: text, hint, textSize, backgroundColor, inputType, style)
- app/src/main/java/<package path>/<Name>Activity.kt using ViewBinding, wiring every component event from the spec, and performing navigation with explicit Intents to the target activities.
You MUST implement the contract's screenWiring entry for this screen: call every listed repository method for real (lifecycleScope + Result handling + user-visible error state), navigate to every listed target, and implement any feature this screen owns with the real API named in featureOwners. Read/write settings only via PreferencesStore. All user-visible strings in the contract's uiLanguage, from strings.xml.
Reference data/network classes by their contract names — do not define them here.`,
  data: `Generate the data and network layer ONLY, exactly matching the contract's class list and public API signatures:
- one Kotlin data class file per data model in package <pkg>.data
- a PreferencesStore (SharedPreferences wrapper) in <pkg>.data covering every user setting in the spec — this is the ONLY place SharedPreferences is touched
- one Retrofit service interface per API in <pkg>.network (with the spec's endpoints), plus an ApiClient object building Retrofit instances with the spec base URLs, 10s timeouts, keys from BuildConfig, and logging only under BuildConfig.DEBUG
- one Repository class per API in <pkg>.repository exposing suspend functions that wrap the service and return Result<T> with error handling
- any device-capability helper the contract assigns (location provider wrapper, ML Kit analyzer, audio/tempo controller) implemented with the real platform API.
Do NOT generate activities or layouts in this stage.`,
  integrate: `You receive the complete generated project plus the build contract. Audit the project against this checklist and RETURN CORRECTED FILES for every problem you find.

Checklist:
1. Unused Gradle dependencies (declared but never imported) — remove them, or implement the feature they belong to if the contract requires it.
2. Declared-but-never-called repositories, services, data classes, helpers — wire them into the owning screen per the contract, or delete them.
3. Placebo/simulated logic (hardcoded value lists, fake sensor loops, features that only change a label) — replace with the real API from featureOwners.
4. Direct SharedPreferences usage outside PreferencesStore — route through PreferencesStore.
5. Orphan Activities not reachable from any other screen — add a real navigation entry point.
6. Language conflicts between TTS locale, strings.xml and inline strings — unify on the contract's uiLanguage and move inline strings to strings.xml.
7. HttpLoggingInterceptor active in release, isMinifyEnabled = false, or hardcoded API keys — fix per the release-safety rule.
8. Legacy APIs (LocationManager, onRequestPermissionsResult) — replace with the modern equivalents.

Return ONLY this JSON shape:
{"files":[{"path":"...","content":"full corrected file"}],
 "report":{"checks":[{"id":"unusedDependencies|deadCode|placeboLogic|settingsSource|navigation|language|releaseSafety|legacyApis","label":"short label in the contract's uiLanguage","status":"ok|fixed|warning","detail":"one sentence"}],
 "manualFollowUps":["things the developer must still do, e.g. supply an API key"]}}
Only include files you actually changed.`,
  review: `You receive the complete generated project file tree. Fix ONLY real correctness problems: missing/incorrect imports, references to classes or ids that do not exist, activities missing from the manifest, layout ids not matching ViewBinding usage, missing Gradle dependencies for used libraries, and Kotlin syntax errors.
Return ONLY the files you actually changed (full content for each). If nothing needs changing return {"files":[]}.`,
  repair: `A deterministic static analyzer found concrete defects in specific files. You receive those files and the exact issue list.

For EVERY listed issue, return the complete corrected file:
- unbalancedBrackets / strayToken / placeholder: repair the syntax so the file compiles. Remove corruption artifacts (stray identifiers after a closing brace), never delete working logic.
- bleScanFilter: add ScanFilter with the relevant service UUID (heart rate = 0000180D-0000-1000-8000-00805f9b34fb) and ScanSettings, and only connect to a matching device.
- playServicesCheck: guard with GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) and surface a user-visible fallback instead of crashing.
- toolbarMenu: also return res/menu/<name>.xml and inflate it properly so the menu item exists.
- syntheticAudio: replace tone synthesis with a real media source (MediaController/AudioManager over the user's own player, a user-picked track, or res/raw the README asks the developer to supply).
- paidApi / staticOAuthToken: add a real fallback path or the actual OAuth token-refresh flow.

Return ONLY: {"files":[{"path":"...","content":"full corrected file"}],"report":{"checks":[{"id":"rule id","label":"short label in the contract's uiLanguage","status":"ok|fixed|warning","detail":"one sentence"}],"manualFollowUps":["..."]}}`,
  projectRepair: `You are executing ONE stage of a project-wide completion roadmap. This is an atomic, holistic repair — never treat findings as isolated patches.

You receive the COMPLETE project, the complete audit report, and the selected roadmap stage. Before editing, reason across the full dependency graph: Gradle dependencies, manifest declarations, resources, models, service/repository contracts, callers, navigation and language. Preserve working behavior and existing public APIs unless the roadmap explicitly requires coordinated migration of every caller.

Rules:
1. Address only the selected stage, but fix every directly coupled file needed to make that stage internally consistent.
2. Respect earlier roadmap stages and do not implement a later stage prematurely.
3. Never introduce a class, resource, id, dependency, permission, method or constructor without updating every required declaration and caller in the same batch.
4. Never replace real implementation with placeholders, TODOs, simulated data or deleted functionality.
5. Re-read the resulting project as a whole before returning it. Ensure imports, package names, signatures, resources, manifest and Gradle remain mutually consistent.
6. If the stage cannot be completed without credentials, commercial APIs, missing product decisions, binary assets or a live integration environment, make all safe code changes and return status "blocked" with structured blockers instead of inventing a stand-in.
7. You may receive PREVIOUS FAILED ATTEMPTS. Never repeat their strategy on an unchanged project. Choose a materially different architecture and state the difference. If no materially different safe strategy exists, return status "blocked"; do not resubmit equivalent edits.
8. A server/proxy integration that does not yet exist cannot be proven by Android-only code. Define the production client contract and honest disabled/error UI, then block only the credential, deployment or live integration-test work that truly requires external action.

Return ONLY this JSON shape:
{"files":[{"path":"relative project path","content":"complete corrected file"}],"repair":{"status":"applied|blocked","strategySummary":"specific architecture and procedure used","differenceFromPrevious":"material difference from prior attempts, or first attempt","addressedFindingIds":["finding id"],"changedPaths":["path"],"manualFollowUps":["manual action"],"blockers":[{"kind":"credential|external-service|product-decision|binary-asset|integration-test|other","detail":"what cannot be completed in this codebase","requiredAction":"specific action that changes the prerequisites"}]}}`,

};

interface HandlerResult {
  files?: { path: string; content: string }[];
  contract?: unknown;
  report?: unknown;
  repair?: unknown;
  error?: string;
}

async function handleStage(body: Record<string, unknown>): Promise<HandlerResult> {
  const { stage, spec, screen, files, contract, issues, reviewReport, roadmapStep, previousAttempts, directives } = (body ?? {}) as {
    stage?: string;
    spec?: Record<string, unknown> & { packageName?: string; screens?: { id: string; name: string }[] };
    screen?: unknown;
    files?: { path: string; content: string }[];
    contract?: unknown;
    issues?: { path: string; rule: string; message: string; severity?: string }[];
    reviewReport?: unknown;
    roadmapStep?: unknown;
    previousAttempts?: unknown[];
    directives?: unknown;
  };


  if (!stage || !STAGE_PROMPTS[stage]) return { error: "Invalid stage" };
  if (!spec) return { error: "Spec is required" };

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return { error: "LOVABLE_API_KEY is not configured" };

  const pkg = spec.packageName ?? "com.example.app";
  const pkgPath = `app/src/main/java/${String(pkg).replace(/\./g, "/")}`;

  let userContent = `Package: ${pkg}\nJava/Kotlin source root: ${pkgPath}\n\nAPP SPECIFICATION:\n${JSON.stringify(
    stage === "screen" ? { ...spec, screens: undefined } : spec,
    null,
    2,
  )}`;

  if (contract && stage !== "contract") {
    userContent += `\n\nBUILD CONTRACT (binding — obey exactly):\n${JSON.stringify(contract, null, 2)}`;
  }

  if (stage === "screen") {
    userContent += `\n\nSCREEN TO GENERATE:\n${JSON.stringify(screen, null, 2)}\n\nAll screen ids for navigation targets: ${(spec.screens ?? [])
      .map((s) => `${s.id} (${s.name})`)
      .join(", ")}`;
  }
  if (stage === "review" || stage === "integrate" || stage === "repair" || stage === "projectRepair") {
    const tree = files ?? [];
    if (tree.length > 800 || tree.some((file) => file.path.length > 500 || file.content.length > 500_000)) {
      return { error: "Kodbasen är för stor för en säker reparationsbatch." };
    }
    userContent += `\n\nPROJECT FILES:\n${tree.map((f) => `--- ${f.path} ---\n${f.content}`).join("\n\n")}`;
  }
  if (stage === "repair") {
    userContent += `\n\nSTATIC ANALYSIS ISSUES (fix every one):\n${(issues ?? [])
      .map((i) => `- [${i.severity ?? "error"}] ${i.path} (${i.rule}): ${i.message}`)
      .join("\n")}`;
  }
  if (stage === "projectRepair") {
    if (!roadmapStep || !reviewReport || !(files?.length)) return { error: "Roadmap, granskningsrapport och projektfiler krävs." };
    userContent += `\n\nCOMPLETE AUDIT REPORT:\n${JSON.stringify(reviewReport, null, 2)}`;
    userContent += `\n\nSELECTED ROADMAP STAGE (execute atomically):\n${JSON.stringify(roadmapStep, null, 2)}`;
    if (previousAttempts?.length) {
      userContent += `\n\nPREVIOUS FAILED ATTEMPTS ON THIS UNCHANGED PROJECT (negative constraints — do not repeat):\n${JSON.stringify(previousAttempts, null, 2)}`;
    } else {
      userContent += "\n\nPREVIOUS FAILED ATTEMPTS: none. This is the first strategy for these project contents.";
    }
  }

  const model =
    stage === "contract" || stage === "integrate" || stage === "repair"
      ? "openai/gpt-5.5"
      : stage === "projectRepair"
        ? "google/gemini-3.1-pro-preview"
      : "google/gemini-3.7-flash";


  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: `${BASE_RULES}\n\nSTAGE INSTRUCTIONS:\n${STAGE_PROMPTS[stage]}` },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const status = response.status;
    const text = await response.text();
    console.error("AI gateway error:", status, text);
    return {
      error:
        status === 429
          ? "Rate limited. Vänta en stund och försök igen."
          : status === 402
            ? "AI-krediter slut. Lägg till krediter i din workspace."
            : status === 403
              ? "AI är blockerat för denna workspace."
              : "Kodgenereringen misslyckades.",
    };
  }

  const data = await response.json();
  const raw: string = data.choices?.[0]?.message?.content ?? "{}";
  let parsed: HandlerResult;
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, ""));
  } catch {
    console.error("Failed to parse model output", raw.slice(0, 500));
    return { error: "AI:n returnerade ogiltig JSON." };
  }

  const outFiles = (parsed.files ?? []).filter(
    (f) => f && typeof f.path === "string" && typeof f.content === "string",
  );

  return { files: outFiles, contract: parsed.contract ?? null, report: parsed.report ?? null, repair: parsed.repair ?? null };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const body = await req.json().catch(() => ({}));

  // Long stages can exceed the 150s idle timeout, so stream whitespace heartbeats
  // (ignored by JSON.parse) until the final JSON payload is ready.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(" "));
        } catch {
          /* stream closed */
        }
      }, 10_000);

      let payload: HandlerResult;
      try {
        payload = await handleStage(body);
      } catch (e) {
        console.error("generate-code error:", e);
        payload = { error: e instanceof Error ? e.message : "Unknown error" };
      }
      clearInterval(heartbeat);
      controller.enqueue(encoder.encode(JSON.stringify(payload)));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

