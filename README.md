# RBFA Scouting Radar

Een onafhankelijk scoutingdashboard voor beschrijvende spelersstatistieken. Geen Monte Carlo, RAPM of andere dure statistische modellen.

## Dashboard
React/Vite met zoeken, sorteren, filters op reeks, ploeg, rugnummer, leeftijd, speelminuten en alle overige beschrijvende statistieken. Presets voor jonge veelspelers, ervaren spelers met weinig minuten, invallers en basisspelers. CSV-export en individuele spelersfiche met RBFA-links.

## Eenmalige instelling
1. GitHub → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Actions → **Update scouting data** → **Run workflow**. Dit haalt de eerste scoutingdata op en pusht ze naar `main`.
3. Een push naar `main` bouwt en publiceert de website via **Deploy scouting dashboard**.
4. Website: https://vjo18.github.io/scouting2627/

## Nieuwe competitie
Voeg een object toe aan `config/competitions.json` met unieke `id`, `name`, de kalender-URL in `calendar_url` en `enabled: true`. Start daarna **Update scouting data** handmatig. De volgende automatische update draait maandag om 07:20 UTC.

## Lokale commando's
```bash
npm install
npm run dev
npm run refresh
npm run aggregate
npm run build
```

De updateworkflow kopieert de RBFA-scrapers uit een **vastgepinde** commit van het bronproject `vjo18/RBFA2627`, gebruikt alleen kalenders en spelersgegevens en weigert een kalender die bestaande wedstrijden mist. De bestaande spelersdata van het eerste seizoen worden bij de allereerste update gekopieerd om onnodig scrapen te vermijden.

**Datakwaliteit:** onbekende geboortejaren blijven leeg; leeftijd is een benadering op basis van geboortejaar. Een speler wordt voorlopig geïdentificeerd per combinatie van competitie, ploeg en naam; bij identieke namen zijn spelers-ID's later nodig. Scoutingpresets zijn filters, geen objectieve talentvoorspellingen.

**Opmerking:** GitHub Pages toont initieel een lege spelerslijst tot de eerste succesvolle data-update. Als de RBFA-site GraphQL-laden blokkeert, zal de workflow stoppen zonder de vorige dataset te overschrijven.


## Licht / donker thema
Klik bovenaan op **Licht thema** of **Donker thema**. De keuze blijft bewaard in je browser.

## Ontbrekende geboortejaren aanvullen
1. Open het dashboard en klik op **Ontbrekende geboortejaren**.
2. Je ontvangt een puntkomma-gescheiden CSV met **ClubRBFA;Naam;Geboortejaar**. De spelers zonder gekend geboortejaar staan erin, gesorteerd per club.
3. Vul het viercijferige geboortejaar in. Bewaar het als UTF-8 CSV, met puntkomma's.
4. Open op GitHub `data_raw/birthyears.csv` en **voeg de nieuwe rijen toe aan het bestaande bestand**. Vervang het bestaande bestand niet door de export: daarin staan al bekende geboortejaren die behouden moeten blijven.
5. Commit de wijziging op `main`. De workflow **Rebuild scouting birth years** berekent de leeftijden opnieuw zonder opnieuw te scrapen. Na een succesvolle run publiceert de deployworkflow de bijgewerkte website.

Let op: voor `ClubRBFA` toont de export de ploegnaam zoals die in de wedstrijdgegevens staat. Pas waar nodig de clubaanduiding aan in de CSV. Geboortejaar-koppeling gebruikt op dit moment de unieke spelersnaam; meerdere spelers met exact dezelfde naam en verschillend geboortejaar blijven bewust onbekend. Er wordt geen leeftijd geraden.
