# Renditerechner Spanien

Progressive Web App für Immobilienmakler in Spanien. Zwei Rechner auf denselben Eingaben:

- **A – Langfristig vermieten:** Cashflow, Renditen, Amortisation, Vermögensaufbau über bis zu 40 Jahre
- **B – Kaufen und nach X Jahren verkaufen:** Verkaufsgewinn + Mietgewinn, drei Szenarien, IRR

Deutsch und Spanisch, offline nutzbar, Daten nur lokal im Browser (localStorage).

## Start

```bash
npm install
npm run dev        # Entwicklung
npm test           # Vitest: Engine + Excel-Abgleich + Zahleneingabe
npm run build      # Typprüfung + Produktions-Build nach dist/
npm run icons      # PWA-Icons aus public/icon.svg neu erzeugen
```

Hinweis iCloud: `node_modules` ist ein Symlink auf `node_modules.nosync`, damit iCloud die Abhängigkeiten nicht synchronisiert. Nach einem frischen Klon einfach `npm install` ausführen.

## Deployment (GitHub Pages)

`npm run deploy` führt die Tests aus, baut mit `BASE_PATH=/renditerechner-spanien/` und schiebt `dist/` auf den Branch `gh-pages`.
Adresse: https://romanschempp.github.io/renditerechner-spanien/ – die Daten bleiben pro Gerät im localStorage dieser Adresse.

## Aufbau

```
src/
  engine/          Rechenlogik ohne UI
    types.ts       Datenmodell (Inputs)
    defaults.ts    Beispielobjekt „Blai 30“
    regions.ts     ITP/AJD je autonomer Region (Stand 2026-10, „bitte prüfen“)
    loan.ts        Tilgungsplan monatlich: Annuität, Ratentilgung, endfällig, Ziel „X % nach Y Jahren“,
                   fester / variabler (Euríbor + Marge) / gemischter Zins
    irr.ts         IRR für beliebige Zeitpunkte (auch unterjährig)
    calc.ts        Kaufkosten, Kapital, Jahreswerte, Kennzahlen, Rechner A und B, Sensitivität
    *.test.ts      Unit-Tests inkl. Pflichtabgleich mit der Excel
  i18n/            de.ts, es.ts (alle UI-Texte), Zahlenformat de-DE / es-ES
  state/store.ts   Objekte speichern, laden, duplizieren, löschen (localStorage)
  components/      Eingaben (Accordion, Schnell-/Detailmodus), Ergebnisse, Grafiken (Recharts)
  pdf/report.ts    PDF-Übersicht (jsPDF, lädt erst beim Klick auf „PDF“); Schriften als TTF in public/fonts (OFL)
```

### Datenmodell (Kurzform)

| Bereich | Felder |
|---|---|
| `purchase` | Kaufpreis, gebraucht/Neubau, Region, ITP %, IVA %, AJD %, Modus schnell/detail, Nebenkosten gesamt %, Notar, Gestoría, Anwalt, Tasación, Bank, Makler, Lebensversicherung, Sonstiges |
| `renovation` | Einzelposten (frei), spätere Investitionen/Sonderumlagen mit Jahr |
| `financing` | an/aus, Betrag € oder % vom Kaufpreis, Tilgungsart, Laufzeit Jahre oder Ziel X %/Y Jahre, Zinsart, Festzins, Festzinsjahre, Marge, Euríbor konstant oder Verlauf, Vorfälligkeitsentschädigung % |
| `rental` | Kaltmiete, manuelle Miete je Jahr, Mietausfall % oder Monate, Agentur %, Instandhaltung %, Comunidad/Monat, IBI, Müll, Versicherung, Rücklage, nicht umlegbar, Steuerberatung, Sonstiges, Steigerung gemeinsam oder getrennt |
| `tax` | Steuer Mietgewinn an/aus + %, Steuer Veräußerungsgewinn %, Nichtresident |
| `sale` | Haltedauer (Kommazahl), Preis direkt oder über Wertänderung, 3 Szenarien, Makler %, Anwalt, Plusvalía, Aufbereitung, offene Comunidad, Sonstiges |
| `rentOnly` | Betrachtungszeitraum (Standard Kreditlaufzeit, max. 40), Wertänderung p. a. |
| `excelLogic` | Schalter in den Einstellungen |

### Rechenregeln

- Effektive Miete = Kaltmiete × 12 × (1 − Mietausfall), jährlich gesteigert; eine manuelle Miete wird ab ihrem Jahr die neue Basis.
- Agentur und Instandhaltung in % der effektiven Miete (wie in der Excel).
- NOI = effektive Miete − Betriebskosten. Steuer = Satz × max(0, NOI − Zinsen). Cashflow = NOI − Zinsen − Tilgung − Steuern − spätere Investitionen.
- Tilgung wird nicht doppelt gezählt: Gewinn = Summe Cashflows + Nettoerlös − EK = Mietgewinn (NOI − Zinsen − Steuern) + Verkaufsgewinn (Preis − Verkaufskosten − Steuer − Gesamtinvestition). Ein Test prüft die Gleichheit.
- Variabler Zins: Die Annuität wird bei jeder Zinsänderung (jährlich) auf Restschuld und Restlaufzeit neu berechnet, wie bei spanischen Hypotheken üblich. Zins nie negativ.
- Ziel „X % getilgt nach Y Jahren“: Rate aus der Restschuldformel, Gesamtlaufzeit daraus abgeleitet (mit Kommastellen, letzte Rate kleiner).
- Haltedauer mit Nachkommastellen: Miete und Kosten anteilig, Zins/Tilgung exakt aus den Monaten bis zum Verkauf, Restschuld nach `round(X × 12)` Monaten, IRR mit unterjährigem Zeitpunkt.
- Rechner A: IRR mit dem nicht realisierten Eigenkapitalanteil (Wert − Restschuld) am Ende des Zeitraums.

## Abgleich mit der Excel „Simulación Blai 30“ (Blatt „Rent. con reforma parcial“)

Schalter **Excel-Logik** in den Einstellungen (Zahnrad): Steuern auf die Miete aus, Ertrag = effektive Miete − Kosten − Zinsen (Tilgung nicht abgezogen), „Rentabilidad bruta sobre capital propio“ = Ertrag ÷ EK.

| Prüfwert | Excel | App | Test |
|---|---|---|---|
| Gesamtkosten | 328.069,75 € | 328.069,75 € | ±1 € ✅ |
| ITP 10 % | 26.290 € | 26.290 € | ±1 € ✅ |
| Rate | 1.012 €/Monat | 1.012,72 €/Monat | ±1 € ✅ |
| Zinsen Jahr 1 (bis Jahr 10) | 4.822 € | 4.822,6 € | ±10 € ✅ (alle 10 Jahre) |
| Restschuld Jahr 1 | 172.641 € | 172.670 € | siehe unten |
| EK | 148.069,75 € | 148.069,75 € | ±1 € ✅ |
| Ertrag Jahr 1 | 10.614,35 € | 10.613,8 € | NOI − 4.822 ±1 € ✅, Ertrag ±10 € ✅ |
| Rendite auf EK Jahr 1 | 7,17 % | 7,17 % | ±0,01 Pp. ✅ |
| Verkauf netto | 377.750 € | 377.750 € | ±1 € ✅ |
| Bruttogewinn | 49.680,25 € | 49.680,25 € | ±1 € ✅ |
| Gewinn nach 21 % Steuer | 39.247,40 € | 39.247,40 € | ±1 € ✅ |

**Restschuld:** Die Bank-Tabelle der Excel ist in sich nicht stimmig. In Jahr 1 sind 7.334 € „Amortizado“ ausgewiesen; 180.000 − 7.334 = 172.666 €, „Pendiente de pago“ zeigt aber 172.641 € (25 € weniger). Die App rechnet mit exakter Annuitätenmathematik und kommt auf 172.670 €. Das liegt 4 € neben dem getilgten Betrag (Test ±5 €) und 29 € neben dem ausgewiesenen Saldo (Test ±30 €, Abweichung im Test dokumentiert). Die Zinsen der Jahre 1–10 stimmen jeweils auf ±1 €.

In der normalen Logik (Schalter aus) korrigiert die App die bekannten Schwächen der Excel: Monatsmieten je Jahr werden verwendet (manuelle Miete), die Instandhaltung ist im Cashflow enthalten, die Haltedauer ist frei wählbar, Steuersätze sind einstellbar und alle Kaufnebenkostenposten vorhanden.

Weitere Tests: Annuität (auch 0 % Zins), Ratentilgung, endfällig, Ziel „X % nach Y Jahren“ (Annuität und Ratentilgung), gemischter Zins, Euríbor-Verlauf, IRR (einfach, mehrjährig, unterjährig, undefiniert), Haltedauer 2,5 Jahre, Gewinnzerlegung mit Sonderumlage, Finanzierung aus (EK = Gesamtinvestition), Bruttorendite nach PDF-Beispiel (5,76 %), Break-even-Miete, Neubau (IVA + AJD), Schnellmodus, Kredit in %, 3 %-Einbehalt, Szenarien, Rechner A, Sensitivität, Zahleneingabe (de/es-Formate).

## Checkliste aus `Immobilienrendite_Spanien_Checkliste.pdf`

**1. Einmalige Kosten beim Kauf**
- [x] Kaufpreis
- [x] ITP (gebraucht), Satz je autonomer Region vorbelegt, überschreibbar, Stand-Datum + „bitte prüfen“
- [x] IVA (Neubau, Standard 10 %)
- [x] AJD (Neubau, je Region vorbelegt)
- [x] Notar und Grundbuch · Gestoría · Anwalt · Tasación · Bankgebühren · Makler (Käuferseite) · Sonstiges, dazu Lebensversicherung
- [x] Renovierung und Ausstattung als frei hinzufügbare Posten
- [x] Schnellmodus „Kaufnebenkosten gesamt in %“

**2. Eigenkapital und Fremdkapital**
- [x] Gesamtinvestition = Kaufpreis + Nebenkosten + Renovierung
- [x] EK = Gesamtkapitalbedarf − Kredit, Anzeige der EK/FK-Quote
- [x] Kreditbetrag, Zins fest/variabel/gemischt, Laufzeit, Monatsrate, Zinsen und Tilgung je Jahr, Restschuld nach X Jahren (Tilgungsplan)
- [x] Finanzierungsgebühren (Bankkosten) und Vorfälligkeitsentschädigung
- [x] Tilgung als Vermögensaufbau (EK-Rendite ohne Tilgungsabzug, Eigenkapitalanteil)

**3. Laufende Kosten**
- [x] Mieteinnahmen mit Steigerung, optional je Jahr manuell
- [x] Leerstand/Mietausfall in % oder Monaten
- [x] Hausverwaltung (% der Miete) · Comunidad · IBI · Müll · Versicherung · Reparaturen/Instandhaltung · Rücklage · nicht umlegbare Nebenkosten · Steuerberatung · Sonstiges
- [x] Sonderumlagen als spätere Investitionen in einem bestimmten Jahr

**4. Steuern während der Vermietung**
- [x] Einfacher Steuersatz auf (NOI − Zinsen), abschaltbar
- [x] Hinweis IRPF/IRNR, abzugsfähige Kosten, Leerstand, Doppelbesteuerungsabkommen/Deutschlandbezug, Steuerberater

**5. Renditekennzahlen**
- [x] Bruttomietrendite (Jahreskaltmiete ÷ Kaufpreis)
- [x] Nettomietrendite (vor Finanzierung und Steuern)
- [x] Cashflow nach Finanzierung und Steuern, monatlich und jährlich
- [x] Cash-on-Cash
- [x] Mietausfallquote · DSCR · Break-even-Miete · Gesamtrendite (IRR)
- [x] zusätzlich GK-Rendite, EK-Rendite, EK-Multiple, Amortisationsjahr

**6. Verkauf nach X Jahren**
- [x] Verkaufspreis = Kaufpreis × (1 + Wertänderung)^X oder direkt
- [x] Drei Szenarien pessimistisch/realistisch/optimistisch, auch negativ
- [x] Maklerprovision · Anwalt/Abwicklung · Vorfälligkeit · offene Comunidad · Verkaufsaufbereitung · Plusvalía municipal · Steuer auf Veräußerungsgewinn · Sonstiges
- [x] 3 %-Einbehalt bei Nichtresidenten als Vorauszahlung, Liquidität im Verkaufsjahr und spätere Nachzahlung/Erstattung
- [x] Nettoerlös = Verkaufspreis − Verkaufskosten − Steuern − Restschuld; Gewinn berücksichtigt eingesetztes EK

**7. Gesamtrendite über die Haltedauer**
- [x] EK, Nebenkosten und Renovierung zu Beginn
- [x] Jährlicher Cashflow nach Kosten, Finanzierung und Steuern
- [x] Zusätzliche Investitionen und Sonderumlagen
- [x] Tilgungsverlauf und Restschuld zum Verkaufszeitpunkt
- [x] IRR auf EK und GK, Tilgung nicht doppelt gezählt

**8. Risiken und Prüfpunkte (Info-Icons)**
- [x] Steuerlicher Wohnsitz/DBA (Steuern)
- [x] Eigennutzung (Steuern)
- [x] Mietrecht und Vermietungsanforderungen langfristig vs. touristisch (Kaltmiete)
- [x] Versicherungsrisiken (Versicherung)
- [x] Zinsrisiko, Euríbor-Verlauf pro Jahr (Finanzierung) und Sensitivität Zins ±1 Pp.
- [x] Inflation nominal ≠ real (Gewinn, Wertänderung)
- [x] Opportunitätskosten (IRR auf das GK)
- [x] Fallende Preise testen (Szenarien, Wertänderung auch negativ)

**9. Eingabeblatt** – alle Felder (Region, Typ, Kaufpreis, Steuern, Renovierung, Kapitalbedarf, EK, Kredit, Zins/Laufzeit, Miete, laufende Kosten, Wohnsitz, Haltedauer, Wertänderung, Verkaufskosten und Steuern) sind als Eingaben bzw. Ergebnisse vorhanden.

**10. Quellen** – Hinweise auf Agencia Tributaria, regionale Steuerbehörden (ITP/AJD mit Stand-Datum), Gemeinde (IBI, Müll, Plusvalía) und Steuerberater/Anwalt im UI; Disclaimer im Footer (DE/ES).

## Abschlussprüfung

- [x] `npm test`: alle Tests grün, inkl. Excel-Abgleich
- [x] `npm run build`: Typprüfung und Build ohne Fehler, Service Worker und Manifest erzeugt
- [x] Netlify-Konfiguration vorhanden
- [x] Mobil (390 px) ohne horizontales Scrollen, Desktop zweispaltig, Hell- und Dunkelmodus
