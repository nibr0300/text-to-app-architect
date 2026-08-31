# Steg 2.5: Från "vacker kaross" till fungerande motor

Kimi-bedömningen pekar ut ett tydligt mönster: arkitekturen är rätt, men logiken är stubbar. Generatorn producerar filer som ser kompletta ut var för sig, men ingen del av kedjan garanterar att de faktiskt *används tillsammans*. Den här planen åtgärdar orsaken, inte symptomen.

## Grundproblem

Varje AI-pass ser bara sin egen del av specen. Ingen pass äger frågan "används allt som deklarerats?". Därför:
- Dependencies läggs till i Gradle utan att någon kodgenerering är skyldig att använda dem.
- Repositories/API-tjänster genereras i data-passet, men skärmpasset har ingen skyldighet att anropa dem.
- PreferencesStore genereras, men varje Activity skriver egen SharedPreferences-kod.
- Granskningspasset letar bara efter kompileringsfel — inte efter död kod eller placebo-funktioner.

## Åtgärder

### 1. Kontraktspass före skärmarna (nytt steg)
Ett nytt första AI-steg producerar ett internt "byggkontrakt" (JSON, visas inte som fil) som låser fast:
- Exakt vilka klasser/paket som ska finnas och deras publika signaturer.
- Vilken Activity som ansvarar för varje feature i specen (musiksynk → X, drowsiness → Y).
- Vilka bibliotek som får användas — och vilken fil som ska använda vart och ett.
- Var inställningar läses/skrivs (alltid PreferencesStore, aldrig direkt SharedPreferences).

Kontraktet skickas med i varje efterföljande pass. Skärmpasset får då veta "du ska anropa WeatherRepository.getCurrent() här", istället för att hitta på en Toast.

### 2. Skärpta genereringsregler (system prompt)
Läggs till som hårda krav i BASE_RULES:
- **Ingen placebo-logik.** En feature i specen ska implementeras med riktigt API, inte simuleras. Om något är omöjligt på enheten ska koden använda den riktiga plattforms-API:n ändå (t.ex. FusedLocationProviderClient), inte en hårdkodad lista.
- **Inga oanvända dependencies.** Varje Gradle-beroende måste ha minst en importsats i genererad kod. Annars ska det inte läggas till.
- **Modern plattforms-API** explicit: FusedLocationProviderClient (inte LocationManager), CameraX + ML Kit när ansiktsigenkänning/skanning ingår, MediaSession/AudioManager för ljudkontroll, registerForActivityResult för permissions.
- **Språkkonsekvens.** TTS-locale och samtliga användarsynliga strängar (inkl. strings.xml) på samma språk — härlett från specens språk.
- **Säkerhet i release.** HttpLoggingInterceptor endast under BuildConfig.DEBUG; isMinifyEnabled = true i release med proguard-regler.
- **Full navigation.** Varje genererad Activity måste vara nåbar från minst en annan skärm (Settings får en meny-/knappingång).

### 3. Nytt integrationspass (ersätter dagens tunna review)
Granskningen delas i två:
- **Integrationspass** — får hela filträdet + kontraktet och svarar på en checklista: oanvända klasser, oanvända dependencies, deklarerade men aldrig anropade repositories, dubbel inställningslagring, simulerad data, onåbara Activities, språkkonflikt, debug-logging i release. Returnerar rättade filer.
- **Kompileringsgranskning** — dagens pass (imports, id:n, manifest, syntax).

### 4. Kvalitetsrapport i UI:t
Efter generering visas ett litet "Kvalitetsutlåtande"-kort med de kontroller integrationspasset körde och deras utfall (grönt/varning), plus eventuella kvarvarande luckor som användaren behöver fylla i manuellt. Ärligare än en tyst ZIP-nedladdning.

## Tekniska detaljer

- `supabase/functions/generate-code/index.ts`: nya stages `contract` och `integrate`; kontraktet skickas som extra fält i user-content för `screen`/`data`/`integrate`; BASE_RULES utökas med reglerna ovan; `integrate` och `review` körs på gpt-5.5, resten på gemini-3.7-flash.
- `src/lib/generateCode.ts`: `planStages` får två nya steg; `generateProject` håller kontraktet i minnet mellan pass och returnerar även en `qualityReport`.
- `src/types/generatedProject.ts`: `BuildContract` och `QualityReport`-typer.
- `src/components/CodeGenerator.tsx`: renderar kvalitetsrapporten under filträdet.
- Inga databasändringar.

## Utanför denna omgång

Riktig APK-byggning via GitHub Actions (steg 3) och användarens egna API-nycklar för väder/kartor. Genererad kod läser nycklar från `local.properties`/BuildConfig med tydlig instruktion i README istället för hårdkodning.
