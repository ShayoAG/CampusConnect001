<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/c37a4bed-44dc-4aae-bcea-7fd1f67067e3

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Dashboard Update (Architektur-IA)

- **UX-Struktur geaendert**:
  - Primaere Navigation mit 4 Hauptansichten: `Architektur-Ebenen`, `Nutzungsszenarien`, `Sicherheit & Datenfluesse`, `RWTH-APs`.
  - Sekundaere Auswahl je Hauptansicht ueber das bestehende Select-Feld (dynamisch je Kontext).
  - Fokus auf ruhige Light-Theme-Darstellung mit klarer Kern-/Kontext-Hierarchie.

- **Neue Datenmodell-Felder in `architecture.data.js`**:
  - `viewModes`
  - `architectureLayers`
  - `actors`
  - `zoneEmphasis`
  - `narrativeWeight`
  - `serviceBadges`
  - `inspectorSummary`

- **Wie Actors / Layers / Services jetzt funktionieren**:
  - **Actors** (Lehrende, Studierende, QS/Freigabe, optional Betrieb) werden als klickbare Actor-Chips gerendert und im Inspector mit Rolle, Daten, betroffenen Systemen und Relevanz erklaert.
  - **Architecture Layers** werden ueber die Ansicht `Architektur-Ebenen` als fuenf Perspektiven (Ausgangssituation, Plattform, lokaler Kern, optionale Erweiterungen, Gesamtbild) gefuehrt.
  - **Service-Badges** ersetzen dominante externe Kaesten: optionale Services sind als runde/pill-Badges entlang der aeußeren Zonen klickbar und im Inspector mit Datenklasse (`non-PII`) und Policy-Regeln dokumentiert.

## JSON-Editing fuer morgen

Die Architektur ist jetzt vom Code entkoppelt und liegt in JSON unter:

- `data/architecture/core.json`
- `data/architecture/elements.json`
- `data/architecture/flows.json`
- `data/architecture/views.json`
- `data/architecture/governance.json`

Zusatzdokumentation (inkl. Add/Rename/Hide):

- `data/architecture/README.md`

### Daten vor dem Start validieren

```bash
npm run validate:data
```

Damit werden u. a. ID-Referenzen fuer neue/umbenannte Elemente geprueft (Nodes, Actors, Service-Badges, Flows, Szenarien, ViewModes).

### IDs sicher umbenennen

```bash
npm run rename:id -- old-id new-id
npm run validate:data
```
