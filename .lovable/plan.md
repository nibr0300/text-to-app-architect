# Steg 2: Från JSON-spec till Android-projekt (och APK)

## Mitt ställningstagande

**Strategi 1 (kodgenerering) som MVP nu — Strategi 3 (CI/CD-bygge till APK) som steg 3.**
Strategi 2 (runtime-tolkning) rekommenderas inte: SafeEats-typen av appar behöver CameraX, ML Kit, TTS med svenskt locale och Retrofit mot två olika backends — precis det som en generisk JSON-motor hanterar sämst, och Play Store-risken är reell.

Viktig teknisk begränsning att vara tydlig med: en `.apk` kan inte kompileras inne i den här appens backend (ingen Android SDK/Gradle där). Vägen till en riktig APK går via en byggmiljö med Android SDK — enklast som GitHub Actions-bygge (gratis, ingen egen serverdrift), alternativt en egen Docker-byggserver senare.

## Steg 2 (det som byggs nu): komplett Kotlin-projekt som nedladdningsbar ZIP

Efter att specen genererats får användaren en ny knapp: **"Generera Android-projekt"**.

Flödet:

```text
JSON-spec  →  kodgenererings-AI (Kotlin/Gradle-systemprompt)
           →  filträd (path + innehåll) visas i UI
           →  ZIP-nedladdning (öppningsbar direkt i Android Studio)
```

Vad som genereras per spec-del:

| Spec-del | Genererad kod |
| --- | --- |
| Varje `screen` | `activity_<id>.xml` + `<Name>Activity.kt` (ViewBinding) |
| `components` + `events` | Vyer i layout + click/change-listeners |
| `navigation` | `Intent`-anrop i listeners |
| `dataModels` | Kotlin data classes + SharedPreferences/DataStore-lagring |
| `apis` | Retrofit-interface + Repository per API |
| `permissions` | `AndroidManifest.xml` |
| `theme` | `themes.xml`, `colors.xml`, dark mode |
| Genomgående | `build.gradle.kts` (app + root), `settings.gradle.kts`, `gradle.properties`, `proguard-rules.pro` |

Genereringen sker i **flera pass** istället för ett enda gigantiskt AI-svar, vilket är det som annars gör kodkvaliteten opålitlig:

1. **Pass A – Projektskelett:** Gradle-filer, manifest, tema/färger, `res/values`.
2. **Pass B – Per skärm (ett anrop per skärm):** layout-XML + Activity-Kotlin, med skärmens spec + globala konventioner som kontext.
3. **Pass C – Data & nätverk:** data classes, prefs-lagring, Retrofit-interfaces, repositories.
4. **Pass D – Granskning:** ett sista AI-pass som får hela filträdet och rättar importfel, saknade referenser och manifest-registreringar av activities.

Tvärgående krav som skrivs in i systemprompten (från ditt exempel): TTS med `Locale("sv","SE")`, tillgänglighet (stora textstorlekar, contentDescription, TalkBack), offline-/timeout-hantering för lokal Ollama-server med tydligt felmeddelande, och graceful fallback när nätverk saknas.

## UI-tillägg

- Ny sektion under spec-vyn: **Kodgenerering** med progressindikator per pass.
- Filträd till vänster, kodvisning med syntax-liknande formatering till höger.
- Knappar: **Ladda ner ZIP**, **Kopiera fil**, **Regenerera fil** (en enskild fil kan köras om utan att hela projektet görs om).
- Genererat projekt sparas precis som specen, så det överlever att man lämnar appen.

## Steg 3 (nästa iteration, ej nu): riktig APK

När JSON-schemat och kodkvaliteten är stabila:
- Användaren kopplar ett GitHub-konto; appen pushar det genererade projektet till ett repo med en färdig workflow-fil (`assembleDebug` + artefakt-uppladdning).
- Appen pollar bygg-statusen och erbjuder nedladdning av `.apk` när bygget är klart (typiskt 3–6 min).
- Signering med release-keystore läggs till som valfritt steg för Play Store.

Detta kräver ingen egen serverinfrastruktur och ger dig samma resultat som en Docker-baserad byggkedja, till noll driftkostnad.

## Teknisk sammanfattning

- Ny edge-funktion `generate-code` som tar `AppSpec` + `stage` (skeleton/screen/data/review) och returnerar `{ files: [{ path, content }] }` som strömmande output.
- Modell: `google/gemini-3.7-flash` för skärm-/datapass (snabbt, billigt, stort kontextfönster), `openai/gpt-5.5` för granskningspasset där korrekthet väger tyngst.
- ZIP byggs klientsidan med `jszip` — ingen serverlagring behövs.
- Nya typer i `src/types/generatedProject.ts`; nya komponenter `CodeGenerator.tsx` och `FileTreeViewer.tsx`; `src/lib/generateCode.ts` orkestrerar passen sekventiellt med begränsad samtidighet.
- Felhantering enligt gateway-kontraktet: 402/403 visas som tydligt kreditmeddelande och stoppar kedjan, 429 backoff.
