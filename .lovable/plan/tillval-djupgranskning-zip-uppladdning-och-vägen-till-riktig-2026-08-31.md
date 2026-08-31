# Tillval: Djupgranskning, ZIP-uppladdning och vägen till riktig APK

## 1. Djupgranskning ("Kimi-nivå") som fristående funktion

En ny sektion i appen: **Kodgranskning**. Den fungerar i två lägen:

- **Sluttest** av det projekt som just genererats (filerna finns redan i minnet).
- **Fristående granskning** av valfri kodbas som laddas upp som ZIP — kräver ingen spec.

Granskningen körs i tre steg:

```text
Kodbas  →  deterministisk statisk analys (lintProject, utökad)
        →  AI-revision per område (arkitektur, funktionalitet, säkerhet, byggbarhet)
        →  sammanvägd rapport med betyg, kritiska buggar och åtgärdslista
```

Rapporten innehåller, i samma anda som gårdagens externa bedömning:

| Del | Innehåll |
| --- | --- |
| Sammanfattning | Uppskattad färdighetsgrad i procent + kort omdöme |
| Kritiska fel | Kompileringshinder, placebo-logik, död kod, dubbel lagring |
| Funktionslucka | Spec-krav (om spec finns) som saknar verklig implementation |
| Säkerhet & behörigheter | Hårdkodade nycklar, saknade runtime-permissions, osäkra anrop |
| Byggbarhet | Manifest-registreringar, Gradle-beroenden som inte används eller saknas |
| Åtgärdslista | Prioriterade punkter, var och en kopplad till en filväg |

Varje åtgärdspunkt får knappen **Åtgärda med AI**, som kör befintligt reparationspass mot just de filerna. Granskningen kan köras om efteråt så att man ser förbättringen.

## 2. Skicka in en ZIP för granskning

- Dra-och-släpp eller filväljare i granskningssektionen.
- ZIP:en packas upp i webbläsaren (jszip) — inget laddas upp till servern i onödan.
- Filter: bara källkod och byggfiler tas med (`.kt`, `.java`, `.xml`, `.gradle.kts`, `.gradle`, `.pro`, `.json`, `.md`). Binärer, `build/`, `.git/`, `.gradle/` och bilder hoppas över.
- Storleksgräns med tydligt meddelande, och en filträdsvy där man ser exakt vad som kommer granskas.
- Uppladdad kodbas kan även användas som utgångspunkt för filträdet/kodvyn som redan finns.

## 3. Guide: vad som krävs för riktig APK-leverans

Detta byggs inte nu, men här är exakt vad du behöver ordna för att steg 3 ska bli möjligt.

**Grundproblemet:** en APK måste kompileras av Android SDK + Gradle + JDK. Det går inte inne i appens backend. Bygget måste ske i en miljö som har dem.

**Rekommenderat spår — GitHub Actions (noll driftkostnad):**

1. Skapa ett GitHub-konto och en organisation för byggen.
2. Skapa en GitHub App (eller en Personal Access Token med `repo`- och `workflow`-rättigheter) så att appen får skapa repon och läsa byggartefakter. Token läggs som hemlighet i backend.
3. Bestäm reponamn-strategi: ett privat repo per genererat projekt, eller ett gemensamt repo med en gren per bygge.
4. Generatorn lägger till en färdig `.github/workflows/build.yml` i projektet (JDK 17, `gradle/actions/setup-gradle`, `./gradlew assembleDebug`, upload-artifact).
5. Appen pushar projektet via GitHub API, pollar bygg-status, och erbjuder nedladdning av `.apk` när artefakten finns (typiskt 3–6 minuter).
6. Byggloggar hämtas vid fel och matas in i reparationspasset, så att kompileringsfel kan rättas automatiskt och bygget köras om.

**För signerad release-APK / Play Store krävs dessutom:**

- En release-keystore (`.jks`) som du genererar en gång med `keytool`.
- Keystore + lösenord + alias lagrat som hemligheter (base64-kodad keystore).
- Google Play Developer-konto (engångsavgift ~25 USD) om appar ska publiceras.

**Alternativt spår — egen byggserver:** en Docker-container med Android SDK som kör i en molntjänst med kö. Ger snabbare byggen och full kontroll men kostar drift och kräver skalningshantering. Rekommenderas först när volymen motiverar det.

**Vad du behöver besluta innan steg 3 startas:** GitHub Actions eller egen byggserver, om användaren kopplar sitt eget GitHub-konto eller om plattformen äger byggkontot, samt om release-signering ska ingå från början.

## Teknisk sammanfattning

- Ny edge-funktion `review-codebase` med stegen `audit` (område för område) och `verdict` (sammanvägning). Streamar heartbeats som `generate-code` för att undvika 150 s idle timeout.
- Nya typer i `src/types/review.ts`: `ReviewFinding`, `ReviewSection`, `ReviewReport`.
- `src/lib/reviewCodebase.ts` orkestrerar lint + AI-pass; `src/lib/importZip.ts` packar upp och filtrerar ZIP.
- Nya komponenter: `CodeReview.tsx` (rapportvy med sektioner och åtgärdsknappar) och `ZipUpload.tsx`.
- `lintProject.ts` utökas med regler för hårdkodade nycklar, oanvända Gradle-beroenden och activities som saknas i manifestet.
- Åtgärdsknappen återanvänder `repair`-stadiet i `generate-code`.
- Rapport och uppladdad kodbas sparas i localStorage som spec och projekt redan gör.
