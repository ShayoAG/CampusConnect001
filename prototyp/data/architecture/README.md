# Architecture Data (JSON-first)

Die Visualisierung ist vom Quellcode entkoppelt. Alle fachlichen und visuellen Inhalte liegen in JSON-Dateien:

- `core.json`: Canvas, Zonen, Ringe, Cluster, Zonen-Gewichtung
- `elements.json`: Komponenten, Actors, Service-Badges, Embedded-Elemente
- `flows.json`: Datenflüsse (Kanten)
- `views.json`: Hauptansichten, Ebenen, Szenarien, Inspector-Zusammenfassungen
- `governance.json`: Narrative-Gewichtung, Sicherheitsprinzipien, FAQ, AP-Mapping

Die Renderlogik bleibt in `app.js`.

## Schneller Workflow

1. JSON bearbeiten.
2. Daten prüfen:
   - `npm run validate:data`
   - optional nach ID-Umbenennung: `npm run rename:id -- <oldId> <newId>`
3. App starten:
   - `npm run dev`

## Elemente ein-/ausblenden

Setze an jedem Element/Flow/View optional:

```json
{ "id": "learning-companion", "enabled": false }
```

Unterstützt für:

- `nodes`, `actors`, `serviceBadges`, `edges`
- `viewModes`, `scenarios`, `groups`, `rings`

Hinweis: Zusätzlich bleibt `optional` + der UI-Schalter "Optionale Services" aktiv.

## Neues Element hinzufügen

Beispiel in `elements.json` unter `nodes`:

```json
{
  "id": "competency-graph",
  "label": "Competency Graph",
  "zone": "de-onprem",
  "dataClass": "non-pii",
  "x": 430,
  "y": 650,
  "width": 210,
  "height": 60,
  "shortDescription": "Verknüpft Kompetenzen für Pfadlogik.",
  "purpose": ["Kompetenzen modellieren"],
  "inputs": ["Kompetenzdaten"],
  "outputs": ["Graph-Signale"],
  "securityNotes": ["Keine PII-Verarbeitung"]
}
```

Danach optional:

- in `core.json` einem Cluster zuordnen (`groups[].nodeIds`)
- in `flows.json` Kanten ergänzen
- in `views.json` Sichtbarkeit je Szenario ergänzen (`nodeIds`, `visibleNodeIds`)

## Element umbenennen (sicher)

### Nur Label ändern (ohne Referenzänderungen)

- In JSON nur `label` und optional `displayLabel` ändern.
- `id` bleibt gleich.

### ID ändern (mit Referenzänderungen)

Wenn `id` geändert wird, müssen alle Referenzen mitgezogen werden:

- `groups[].nodeIds` (in `core.json`)
- `edges[].source|target` (in `flows.json`)
- `scenarios[].nodeIds|visibleNodeIds` (in `views.json`)
- `actors[].touchNodeIds` (in `elements.json`)

Danach immer:

- `npm run validate:data`

### Empfohlen: ID automatisch umbenennen

```bash
npm run rename:id -- old-id new-id
npm run validate:data
```

Das Tool ersetzt die ID konsistent in allen Architektur-JSON-Dateien.

## Neue Hauptansicht oder Szenario anlegen

- `views.json`:
  - in `viewModes` neue Hauptansicht anlegen
  - zugehörige `scenarioIds` definieren
  - Szenario in `scenarios` hinzufügen

Mindestfelder für ein Szenario:

```json
{
  "id": "usage-new-scenario",
  "viewModeId": "usage-scenarios",
  "label": "Neues Szenario",
  "description": "Kurzbeschreibung",
  "edgeIds": [],
  "nodeIds": []
}
```

## Service-Badge hinzufügen

In `elements.json` unter `serviceBadges` ergänzen:

```json
{
  "id": "badge-new-service",
  "label": "Neuer Service",
  "zone": "eu-cloud",
  "visualType": "service-badge",
  "shape": "pill",
  "dataClass": "non-pii",
  "x": 1180,
  "y": 420,
  "width": 210,
  "height": 58,
  "optional": true,
  "allowedDataClass": "non-pii",
  "policy": "Nur ueber die LMS AI Workflow Engine"
}
```

Dann Flow in `flows.json` ergänzen (source/target per `id`).

## Häufige Fehler

- doppelte `id`
- Kante mit unbekanntem `source`/`target`
- Szenario referenziert nicht existente IDs
- ViewMode referenziert unbekannte Szenarien

Diese Fälle fängt `npm run validate:data` ab.
