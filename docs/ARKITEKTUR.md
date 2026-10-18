# NLP Programmer – arkitektur och instruktioner

Grund: *Text2App: A Framework for Creating Android Apps from Text Descriptions* (arXiv 2104.08301v2), se `docs/research/`.
Filosofi: Language-Based Relational Field-Architecture (RFA) – språk är källan, allt annat härleds relationellt ur det.

## Två appar – var de bor

| | Byggaren (NLP Programmer) | Appen som byggs (Android) |
|---|---|---|
| Vad | Webbapp i React/Vite | Kotlin/Gradle-projekt |
| Var | Denna kodbas (`src/`, `supabase/functions/`) | **Inte i kodbasen.** Finns i webbläsarens lagring, i ZIP-nedladdningen och i det privata GitHub "builds"-repot |
| Undantag | – | `public/komplettering.md` = användarens referenskod för en genererad app (läses in via knappen "Läs in min komplettering") |

## Flöde (Text2App-principen, utökad)

```text
Text  -> generate-spec   -> AppSpec (JSON, motsvarar Text2Apps SAR)
AppSpec -> appContract.ts -> App Contract (YAML + acceptanstester, deterministiskt, ingen AI)
Kontrakt -> godkännande   -> kodgenerering låses upp först efter godkänt kontrakt
AppSpec -> generate-code -> Kotlin/Gradle-projekt i 7 pass:
          skeleton, contract, ui, logic, integrate, (lint), repair
Projekt -> review-codebase -> granskning, roadmap, reparation per etapp
Projekt -> build-apk      -> push till GitHub, Actions kör gradle assembleDebug
         -> build-status  -> hämtar färdig APK
```

## Byggarens delar

- `src/pages/Index.tsx` – huvudsida, sparar spec/projekt/kontrakt lokalt
- `src/components/DescriptionInput, SpecViewer, StreamingOutput` – text till spec
- `src/lib/appContract.ts`, `src/components/ContractViewer.tsx` – kontrakt med acceptanstester och godkännandelås
- `src/components/CodeGenerator.tsx`, `src/lib/generateCode.ts` – kodgenerering
- `src/lib/lintProject.ts` – deterministisk statisk kontroll
- `src/components/CodeReview.tsx`, `src/lib/reviewCodebase.ts`, `src/lib/completeness.ts`, `src/lib/importZip.ts` – granskning, roadmap, direktiv, referenskod, ZIP-import
- `src/components/ApkBuilder.tsx`, `src/lib/buildApk.ts` – APK-bygge
- `src/types/` – AppSpec, genererat projekt, granskning
- `supabase/functions/` – serverfunktionerna ovan (AI via Lovable AI Gateway)

## Byggmiljökontrakt för genererade appar
JDK 17, Android SDK, Gradle 8.7, `gradle assembleDebug --no-daemon`. Ingen Gradle-wrapper, inga binärfiler, inga värdkommandon. Radering sker via `deletePaths`.

## Hemligheter som krävs
`APK_GITHUB_TOKEN`, `APK_GITHUB_OWNER`, `APK_GITHUB_REPO`.

## Mätning och kostnadsskydd

- **Bevisberäknat färdighetsmått** (`src/lib/completeness.ts`): headerns procentsiffra räknas ur
  kontraktets acceptanstester (40p), statisk analys (30p) och AI-revisionernas anmärkningar (30p),
  med tak på 45p vid statiska byggfel och 70p vid kritiska brister. Samma underlag ger alltid samma
  siffra. AI:ns egen uppskattning visas nu bara som jämförelse och räknas inte in.
- **Kostnadsskydd** (`reviewInputKey` i `src/lib/reviewCodebase.ts`): ett granskningssvar gäller de
  filer, den spec, de direktiv och den referenskod det gavs. Är allt oförändrat körs ingen AI om —
  knappen säger till och kräver ett andra, medvetet klick för att ändå köra en ny granskning.

## Kontrollpunkt 2026-10-18

Läge när bygget pausas: appkontrakt med godkännandelås, kontraktsgranskning av acceptanstester,
bevisberäknat färdighetsmått och kostnadsskyddet är implementerade och verifierade mot preview och
backend. Tester: `src/test/completeness.test.ts`. Öppet: GitHub App istället för PAT, samt
release-signering (APK:n är debug-signerad).

## Återupptagning

1. Klistra in en ny appbeskrivning → spec → godkänn kontraktet.
2. Generera kod och granska — kontraktsgranskningen visar vilka acceptanstester som klaras.
3. Reparera etappvis och bygg APK via GitHub Actions.

## Planhistorik

Godkända planer finns i `.lovable/plan/`.
