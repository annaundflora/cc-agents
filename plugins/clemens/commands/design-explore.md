---
description: "Design Exploration Agent. Interaktiver Design-Prozess mit Varianten, Design System Recherche und Pencil-Integration. Zwischen Discovery und Wireframe."
---

# Design Exploration

Du führst den **Design Exploration Agent** aus — interaktiver Design-Prozess zwischen Discovery und Wireframe.

**Input:** $ARGUMENTS

---

## Phase 1: Input-Validierung

1. Prüfe ob `$ARGUMENTS` einen Spec-Pfad enthält
2. Falls kein Argument: Suche neuestes `specs/*/discovery.md` und frage via AskUserQuestion
3. Validiere dass `discovery.md` existiert im Spec-Ordner
4. Falls nicht: STOP mit Hinweis "Zuerst /discovery ausführen"
5. Prüfe ob `discovery.md` eine "UI Layout" oder "User Flow" Section enthält
6. Falls nicht: Warnung ausgeben, fragen ob fortfahren

**Spec-Pfad ermitteln:** Extrahiere den Ordnerpfad aus $ARGUMENTS oder dem gefundenen Discovery

---

## Phase 2: Draft-Check

1. Prüfe ob `design-decisions.md` im Spec-Ordner existiert
2. Falls ja UND Status "Draft":
   - Zeige letzte offene Stelle
   - AskUserQuestion: "Draft gefunden. Fortsetzen oder neu starten?"
   - Bei "Fortsetzen" → An letzter Stelle weitermachen
   - Bei "Neu starten" → Datei überschreiben

---

## Phase 3: Design Exploration

1. Lies die Agent-Definition: `${CLAUDE_PLUGIN_ROOT}/agents/design-explore.md`
2. Übernimm die dort beschriebenen Workflows und Verhaltensweisen
3. Führe den Design Exploration Workflow durch:
   - 🔍 DIVERGE: Design System Recherche, Codebase-Analyse, UX Patterns
   - Modus-Bestimmung (Fokus/Exploration)
   - Medium-Wahl (Pencil/ASCII) via AskUserQuestion
   - Pro Screen: Style-Analyse → Varianten → User-Entscheidung
   - 🎯 CONVERGE: Entscheidungen dokumentieren
4. Erstelle `design-decisions.md` nach Template `${CLAUDE_PLUGIN_ROOT}/templates/design-decisions-template.md`
5. Speichere im Spec-Ordner

### Pencil-Integration

Wenn User Pencil wählt, nutze MCP Tools:

```
# Design Guidelines laden
get_guidelines(topic="web-app")  # oder "mobile-app"

# Style-Inspiration (Exploration-Modus)
tags = get_style_guide_tags()
style = get_style_guide(tags=[gewählte Tags])

# Design System erstellen (Exploration-Modus, wenn im Scope)
set_variables({tokens})

# Varianten visualisieren (auf User-Wunsch)
open_document('new')  # oder bestehendes File
space = find_empty_space_on_canvas(direction, size)
nodes = batch_design([operations])
screenshot = get_screenshot(nodeId)
```

**Pencil Fallback:** Wenn MCP Tools nicht antworten → ASCII-only, Hinweis an User.

---

## Phase 4: Output

Nach erfolgreichem Durchlauf:

```
{spec_path}/
├── discovery.md                # Input (existiert)
└── design-decisions.md         # NEU erstellt
```

Optional (wenn Pencil + DS-Erstellung):
```
{spec_path}/
├── discovery.md
├── design-decisions.md
└── design-system.pen           # Optional: Pencil Design System
```

OUTPUT an User:
```
✅ **Design Decisions dokumentiert**

- design-decisions.md ✓
- Modus: {Fokus/Exploration}
- Screens entschieden: {N}
{- Design System erstellt: design-system.pen ✓}

**Nächster Schritt:** /wireframe {spec_path}
```
