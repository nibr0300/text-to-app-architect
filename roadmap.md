# Roadmap

- [x] Lägg till strukturerad färdigställanderoadmap i granskningsrapporten
- [x] Implementera holistisk batchreparation med full projektkontext
- [x] Lägg till regressionsskydd före koduppdatering
- [x] Visa progression mellan granskningar
- [x] Verifiera AI-anrop och tester
- [x] Verifiera preview och aktuell buildstatus
- [x] Spara reparationsförsök och negativ feedback per roadmap-etapp
- [x] Förbjud identiska omförsök utan ändrade förutsättningar
- [x] Stöd blockerade etapper och alternativ strategi i UI
- [x] Verifiera loopskydd, tillfälliga fel och regressionsavvisning- [x] Egna riktlinjer som överordnar spec, granskning och roadmap
- [x] Blockerade/avfärdade etapper parkeras längst ned och återskapas inte
- [x] Ärlig felklassning: upprepade "tillfälliga" fel räknas som misslyckad strategi
- [x] Processgranskning: utvärdera metodval, roadmap och tidigare försök
- [x] Roadmapen formas om av processgranskningens diagnos (dela upp, lägg till beroende, byt arkitektur, parkera)
- [x] APK-bygge via GitHub Actions (push, dispatch, statuspollning, nedladdning)
- [x] Kompilatorfel från bygget matas in som riktlinje till granskaren
- [ ] Uppgradera GitHub-autentisering från PAT till GitHub App
- [ ] Release-signering med egen nyckel (i dag debug-signerad APK)
