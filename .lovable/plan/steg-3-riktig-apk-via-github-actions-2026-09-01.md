# Steg 3: Riktig .apk via GitHub Actions

Ja — din och Kimis bild stämmer. GitHub kan inte bygga en APK "av sig själv" via en App; det är **GitHub Actions** som bygger, och något (en token eller en GitHub App) som lägger upp koden och hämtar hem resultatet. Vi börjar enligt ditt val: **personlig access-token nu, GitHub App senare**, och **ett enda privat builds-repo**.

Efter det här kan du klicka "Bygg APK" i appen och några minuter senare ladda ner en installerbar fil. Ingen kodmiljö, ingen terminal.

## Din del — 4 steg, ca 6 minuter

Allt du gör sker i webbläsaren. Om något ser annorlunda ut: stanna, skicka en skärmbild, så guidar jag vidare.

**Steg 1 — Skapa GitHub-konto (hoppa över om du har ett)**
github.com → Sign up → e-post, lösenord, användarnamn → bekräfta mejlet.

**Steg 2 — Skapa det privata builds-repot**
1. Klicka `+` uppe till höger → "New repository".
2. Repository name: `nlp-programmer-builds`
3. Välj **Private**.
4. Bocka i **Add a README file** (viktigt — repot måste ha minst en fil).
5. "Create repository".

**Steg 3 — Skapa en token**
1. Klicka din profilbild uppe till höger → Settings (längst ner i menyn).
2. Längst ner i vänsterspalten: **Developer settings**.
3. **Personal access tokens** → **Fine-grained tokens** → "Generate new token".
4. Token name: `nlp-programmer`
5. Expiration: 1 år (eller "No expiration").
6. Repository access: **Only select repositories** → välj `nlp-programmer-builds`.
7. Permissions → Repository permissions, ställ in exakt dessa tre:
   - **Contents**: Read and write
   - **Actions**: Read and write
   - **Workflows**: Read and write
8. "Generate token" → kopiera strängen som börjar med `github_pat_...`. **Den visas bara en gång.**

**Steg 4 — Klistra in i appen**
Jag öppnar ett säkert formulär i chatten där du klistrar in token samt ditt GitHub-användarnamn. Värdena går direkt till den krypterade nyckellagringen — de syns aldrig i chatten och inte för mig.

## Vad jag bygger

**Ny knapp "Bygg APK"** i CodeGenerator och CodeReview, tillgänglig när ett projekt finns (genererat eller uppladdat via ZIP).

**Ny backend-funktion `build-apk`** som:
1. Lägger till Gradle wrapper-filerna (`gradlew`, `gradlew.bat`, `gradle-wrapper.properties`) och `.github/workflows/build.yml` i projektet — samma workflow som Kimi visade, JDK 17 + `assembleDebug` + `upload-artifact`.
2. Pushar hela projektet till en egen mapp/branch i `nlp-programmer-builds` via GitHub Contents API.
3. Startar bygget med `workflow_dispatch`.
4. Returnerar ett bygg-id.

**Ny backend-funktion `build-status`** som appen frågar var 10:e sekund: körs / lyckades / misslyckades. Vid lyckat bygge hämtas artefakten och en nedladdningslänk visas. Vid misslyckat bygge hämtas Gradles felloggar in i appen — och de kan matas rakt in i granskningsfunktionens roadmap, så en riktig kompilator äntligen får säga vad som är fel i stället för statisk analys. Det är sannolikt det som får bygget att röra sig framåt igen.

**Ny UI-panel "APK-bygge"**: statusrader per steg (pushar kod → bygger → paketerar), byggloggar vid fel, och "Ladda ner APK" när det är klart.

## Tekniska detaljer

- Hemligheter: `GITHUB_TOKEN` och `GITHUB_OWNER` som backend-secrets, lästa endast i edge functions — aldrig i webbläsaren.
- `gradle-wrapper.jar` är binär och kan inte AI-genereras; funktionen hämtar den från Gradles officiella distribution vid första pushen och cachar den i repot.
- Varje bygge får en egen mapp `builds/<app-slug>-<timestamp>/` i det privata repot, så historik och parallella byggen inte krockar.
- Debug-signerad APK (installerbar direkt på telefon efter "tillåt okända källor"). Release-signering med egen nyckel kan läggas till senare.
- Byggloggar mappas till samma `ReviewFinding`-format som granskaren redan använder, så kompilatorfel kan bli roadmap-etapper.
- Uppgradering till GitHub App senare byter bara ut autentiseringen i edge-funktionerna; allt annat kan stå kvar.

## Ordning

1. Du gör steg 1–3 ovan.
2. Jag öppnar secret-formuläret (steg 4).
3. Jag bygger `build-apk`, `build-status` och UI:t, och kör ett testbygge på ditt senaste projekt så vi ser en riktig APK innan du behöver göra något mer.
