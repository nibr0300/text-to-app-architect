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
AppSpec -> generate-code -> Kotlin/Gradle-projekt i 7 pass:
          skeleton, contract, ui, logic, integrate, (lint), repair
Projekt -> review-codebase -> granskning, roadmap, reparation per etapp
Projekt -> build-apk      -> push till GitHub, Actions kör gradle assembleDebug
         -> build-status  -> hämtar färdig APK
```

## Byggarens delar

- `src/pages/Index.tsx` – huvudsida, sparar spec/projekt lokalt
- `src/components/DescriptionInput, SpecViewer, StreamingOutput` – text till spec
- `src/components/CodeGenerator.tsx`, `src/lib/generateCode.ts` – kodgenerering
- `src/lib/lintProject.ts` – deterministisk statisk kontroll
- `src/components/CodeReview.tsx`, `src/lib/reviewCodebase.ts`, `src/lib/importZip.ts` – granskning, roadmap, direktiv, referenskod, ZIP-import
- `src/components/ApkBuilder.tsx`, `src/lib/buildApk.ts` – APK-bygge
- `src/types/` – AppSpec, genererat projekt, granskning
- `supabase/functions/` – serverfunktionerna ovan (AI via Lovable AI Gateway)

## Byggmiljökontrakt för genererade appar
JDK 17, Android SDK, Gradle 8.7, `gradle assembleDebug --no-daemon`. Ingen Gradle-wrapper, inga binärfiler, inga värdkommandon. Radering sker via `deletePaths`.

## Hemligheter som krävs
`APK_GITHUB_TOKEN`, `APK_GITHUB_OWNER`, `APK_GITHUB_REPO`.

## Planhistorik
Godkända planer finns i `.lovable/plan/`.
