# Holistisk färdigställanderoadmap och säkra batchreparationer

## Mål
Ersätt isolerade punktfixar med ett sammanhängande förbättringsflöde där granskaren planerar projektets väg till byggbarhet, byggaren ändrar samverkande filer i samma batch och varje iteration verifieras mot föregående läge.

## Förändringar

### 1. Strukturerad roadmap i granskningsrapporten
- Utöka rapporten med ordnade reparationsetapper, beroenden, berörda fynd/filer, mål och verifierbara acceptanskriterier.
- Låt slutbedömningen sammanföra överlappande eller motstridiga fynd till gemensamma etapper i rätt ordning, exempelvis bygggrund → kontrakt/API → implementation → navigation/resurser → kvalitet.
- Ge fynd stabila identiteter så att samma grundproblem kan följas mellan granskningar även om formuleringen ändras.

### 2. Holistisk reparation per etapp
- Lägg till ett särskilt projekt-reparationssteg i kodbyggaren.
- Skicka hela kodbasen, app-specifikationen, hela rapporten och vald roadmap-etapp till modellen — inte bara enskilda filer och ett isolerat fynd.
- Kräv en atomisk ändringsmängd som uppdaterar alla samverkande filer och respekterar befintliga kontrakt, resurser, imports, manifest och Gradle-konfiguration.
- Returnera en reparationsrapport med vilka roadmap-punkter som hanterats, vilka filer som ändrats och vilka hinder som kräver manuell insats.

### 3. Regressionsskydd före koduppdatering
- Kör deterministisk analys både före och efter den föreslagna batchen.
- Avvisa automatiskt en batch som introducerar nya statiska fel eller förvärrar felbilden; den befintliga kodbasen lämnas då orörd.
- Kontrollera att returnerade filer har säkra, befintliga eller legitima projektvägar och slå ihop hela batchen först när den passerat kontrollen.

### 4. Progression mellan granskningar
- Behåll föregående rapport och visa förändring i färdighetsgrad samt antal kritiska/allvarliga fynd.
- Matcha kvarstående, lösta och nytillkomna problem med stabila fingeravtryck.
- Markera regression tydligt i stället för att presentera varje ny lista som en fristående sanning.

### 5. UI för färdigställandeflödet
- Visa roadmapen som ordnade etapper med beroenden och acceptanskriterier.
- Ersätt primär punkt-för-punkt-reparation med **Åtgärda nästa etapp**, medan enskilda fynd fortsatt visas som evidens.
- Visa batchens resultat och be användaren köra en ny helhetsgranskning för AI-verifiering; nästa etapp låses upp först när tidigare beroenden är hanterade.

## Tekniska detaljer
- Uppdatera review-typerna med roadmap, historik/delta och reparationsresultat.
- Utöka `review-codebase`-funktionens verdict-format och validera/sanera modellens roadmap-svar.
- Utöka `generate-code` med ett nytt holistiskt reparationssteg skilt från den befintliga lint-reparationen.
- Uppdatera klientorkestreringen och granskningsvyn; spara föregående rapport lokalt för jämförelse.
- Behåll nuvarande ZIP- och genererat-projektflöden samt streaming-heartbeats.

## Verifiering
- Testa roadmap-normalisering och före/efter-jämförelse av lintfynd.
- Verifiera att en regressiv batch inte skrivs till projektet.
- Verifiera i både uppladdad ZIP och genererat projekt att en etapp kan repareras, rapporthistoriken visas och ny granskning ger jämförbar progression.
