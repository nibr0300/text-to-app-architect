# Bryt loopar i holistiska roadmap-reparationer

## Mål
Ett misslyckat reparationsförsök ska förändra nästa försök. Systemet får inte skicka samma etapp med samma kodbas och samma strategi igen, och en etapp som kräver externa beslut eller infrastruktur ska kunna markeras som blockerad i stället för att loopa.

## Förändringar

### 1. Beständig försökshistorik per roadmap-etapp
- Spara varje misslyckat försök med felkategori, projektfingeravtryck, strategi och tidpunkt.
- Skicka historiken till reparationsmodellen vid nästa försök.
- Återställ historiken automatiskt när kodbasen eller en ny granskning faktiskt ändrar förutsättningarna.

### 2. Förbud mot identisk upprepning
- Kräv att reparationssvaret namnger sin strategi och hur den skiljer sig från tidigare försök.
- Avvisa ett nytt försök före AI-anropet om kodbas, etapp och redan prövad strategi är oförändrade utan att användaren väljer en alternativ väg.
- Instruera modellen att inte återanvända tidigare misslyckade procedurer och att välja en materiellt annorlunda arkitektur eller begränsa etappen till säkra förberedelser.

### 3. Tydliga blockerade etapper
- Utöka reparationsresultatet med `applied`, `blocked` och `failed` samt strukturerade blockerare.
- För externa produktionskontrakt kan modellen göra säkra klient-/proxykontrakt och därefter markera sådant som kräver backendkonfiguration, API-behörigheter eller riktiga integrationstester som blockerat.
- UI:t visar orsaken och erbjuder **Försök med annan strategi** endast när ett alternativ finns; annars **Markera blockerad och fortsätt** så beroende etapper kan bedömas utan falskt påstående om verifiering.

### 4. Felklassning och robust återkoppling
- Skilj tillfälliga gatewayfel från regressionsavvisning, ogiltigt modellsvar och verklig extern blockerare.
- Spara regressionsdetaljer och skicka dem som negativ feedback till nästa försök.
- Visa vad som ändras inför nästa försök, inte bara samma generiska ”kodgenereringen misslyckades”.

## Tekniska detaljer
- Utöka review-typerna med reparationsförsök, strategi, status och blockerare.
- Tråda försökshistoriken från granskningsvyn genom klientorkestreringen till `projectRepair`.
- Uppdatera edge-funktionens schema och prompt så identiska strategier är förbjudna och strukturerad blockeringsrapport krävs.
- Behåll atomisk merge och regressionsskydd: blockerad eller avvisad batch skriver aldrig över projektet.

## Verifiering
- Testa att samma strategi och oförändrat projekt inte kan köras om som ett nytt identiskt försök.
- Testa att ett regressionsfel blir kontext för en materiellt annorlunda strategi.
- Testa att externa blockerare kan markeras utan kodändring och att UI:t inte låser användaren i punkt 2.
- Verifiera att ett tillfälligt 503-fel fortfarande kan återförsökas, eftersom det inte är ett misslyckat lösningsförfarande.
