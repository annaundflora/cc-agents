# Clemens Agent Pipeline — Vollständige Dokumentation

**Plugin:** clemens v1.3.4
**Autor:** Clemens (claude-clemens@zipmend.com)
**Beschreibung:** Multi-Agent System mit Fresh Context Pattern, Quality Gates (0–3) und vollständigem Feature-Development-Workflow von Discovery bis Deployment.

---

## Inhaltsverzeichnis

1. [Architektur-Überblick](#1-architektur-überblick)
2. [Verzeichnisstruktur](#2-verzeichnisstruktur)
3. [Kern-Prinzipien](#3-kern-prinzipien)
4. [Gesamtworkflow: Feature-Lifecycle](#4-gesamtworkflow-feature-lifecycle)
5. [Commands (Slash-Befehle)](#5-commands-slash-befehle)
   - 5.1 [/clemens:discovery](#51-clemensdiscovery)
   - 5.2 [/clemens:wireframe](#52-clemenswireframe)
   - 5.3 [/clemens:architecture](#53-clemensarchitecture)
   - 5.4 [/clemens:planner](#54-clemensplanner)
   - 5.5 [/clemens:slim-planner](#55-clemensslim-planner)
   - 5.6 [/clemens:orchestrate](#56-clemenorchestrate)
   - 5.7 [/clemens:slim-orchestrate](#57-clemensslim-orchestrate)
   - 5.8 [/clemens:conflict-scan](#58-clemensconflict-scan)
   - 5.9 [/clemens:debugger](#59-clemensdebugger)
   - 5.10 [/clemens:qa-manual](#510-clemensqa-manual)
   - 5.11 [/clemens:roadmap](#511-clemensroadmap)
   - 5.12 [/clemens:pm-ux-review-de](#512-clemenspm-ux-review-de)
6. [Agents (Sub-Agents)](#6-agents-sub-agents)
   - 6.1 [Discovery & Konzeption](#61-discovery--konzeption)
   - 6.2 [Quality Gates](#62-quality-gates)
   - 6.3 [Planning & Slice-Erstellung](#63-planning--slice-erstellung)
   - 6.4 [Implementation](#64-implementation)
   - 6.5 [Review & Testing](#65-review--testing)
   - 6.6 [Conflict-Aware Pipeline](#66-conflict-aware-pipeline)
   - 6.7 [Utility-Agents](#67-utility-agents)
7. [Quality Gates im Detail](#7-quality-gates-im-detail)
8. [6-Step Implementation Pipeline](#8-6-step-implementation-pipeline)
9. [Conflict-Aware Pipeline](#9-conflict-aware-pipeline)
10. [JSON-Contracts (Input/Output)](#10-json-contracts-inputoutput)
11. [Templates](#11-templates)
12. [State-Management & Resume](#12-state-management--resume)
13. [Retry-Logik](#13-retry-logik)
14. [Stack-Erkennung](#14-stack-erkennung)
15. [Datei-Artefakte pro Phase](#15-datei-artefakte-pro-phase)

---

## 1. Architektur-Überblick

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        FEATURE LIFECYCLE                                │
├─────────────┬──────────┬──────────────┬───────────┬────────────────────┤
│  Discovery  │ Wireframe│ Architecture │ Planning  │  Implementation    │
│             │          │              │           │                    │
│  /discovery │/wireframe│/architecture │ /planner  │  /orchestrate      │
│             │          │              │/slim-plan.│  /slim-orchestrate  │
├─────────────┼──────────┼──────────────┼───────────┼────────────────────┤
│   Gate 0    │  Gate 0  │   Gate 1     │ Gate 2+3  │  Code Review +     │
│ (Wireframe) │(Compli.) │ (Compli.)    │(Compli.)  │  Test Validation   │
└─────────────┴──────────┴──────────────┴───────────┴────────────────────┘
                                                           │
                            ┌──────────────────────────────┤
                            ▼                              ▼
                    Conflict-Scan               QA / Debugger / Roadmap
                   (GitHub Issues)              (Utility-Agents)
```

**23 Agents** | **12 Commands** | **11 Templates** | **4 Quality Gates**

---

## 2. Verzeichnisstruktur

```
plugins/clemens/
├── .claude-plugin/
│   └── plugin.json              # Plugin-Metadaten (Name, Version, Autor)
├── agents/                      # 23 Agent-Definitionen
│   ├── architecture.md
│   ├── architecture-compliance.md
│   ├── code-reviewer.md
│   ├── conflict-reporter.md
│   ├── conflict-scanner.md
│   ├── debugger.md
│   ├── discovery.md
│   ├── discovery-wireframe-compliance.md
│   ├── integration-map.md
│   ├── qa-manual.md
│   ├── roadmap.md
│   ├── slice-compliance.md
│   ├── slice-implementer.md
│   ├── slice-writer.md
│   ├── slim-code-reviewer.md
│   ├── slim-slice-compliance.md
│   ├── slim-slice-implementer.md
│   ├── slim-slice-writer.md
│   ├── slim-slicer.md
│   ├── test-validator.md
│   ├── test-writer.md
│   ├── ux-expert-review-de.md
│   └── wireframe.md
├── commands/                    # 12 Slash-Commands
│   ├── architecture.md
│   ├── conflict-scan.md
│   ├── debugger.md
│   ├── discovery.md
│   ├── orchestrate.md
│   ├── planner.md
│   ├── pm-ux-review-de.md
│   ├── qa-manual.md
│   ├── roadmap.md
│   ├── slim-orchestrate.md
│   ├── slim-planner.md
│   └── wireframe.md
├── templates/                   # 11 Dokument-Templates
│   ├── architecture-feature.md
│   ├── checkpoint-example.md
│   ├── discovery-feature.md
│   ├── plan-spec.md
│   ├── project.md
│   ├── roadmap.md
│   ├── slim-plan-spec.md
│   ├── summary.md
│   ├── ui-implementation-checklist.md
│   ├── weave-setup.md
│   └── wireframe-template.md
└── scripts/
    └── plugin.json.test.js      # Plugin-Validierung
```

---

## 3. Kern-Prinzipien

### 3.1 Fresh Context Pattern

Jeder Sub-Agent wird via `Task()` mit **komplett frischem Context** gestartet. Der Sub-Agent sieht ausschließlich die ihm übergebenen Prompts und Dateipfade — nie den Gesprächsverlauf des Aufrufers.

**Verhindert:**
- **Confirmation Bias:** Agent prüft unvoreingenommen
- **Context Pollution:** Keine irrelevanten Informationen
- **Scope Creep:** Abweichungen werden sofort erkannt

### 3.2 Exit Code ist Wahrheit

```
exit_code == 0 → Erfolg
exit_code != 0 → Fehlschlag (HARD STOP, wenn Retries erschöpft)
```

Keine Interpretation, keine Ausnahmen.

### 3.3 Phasen-Reihenfolge ist bindend

Orchestrator-Phasen laufen **strikt sequenziell** (0→1→2→3→4→5→6→7→8). Keine Phase darf übersprungen werden.

### 3.4 Autonomer Betrieb

Der Orchestrator fragt **niemals** zwischen Waves oder Slices nach Bestätigung. Er läuft vollautomatisch bis zum Erfolg oder HARD STOP.

### 3.5 JSON-Parsing

```
FUNCTION parse_agent_json(agent_output):
  json_blocks = regex_find_all(output, /```json\s*\n(.*?)```/s)
  IF json_blocks.length == 0:
    HARD STOP: "Agent hat keinen JSON-Output geliefert"
  RETURN parse(json_blocks[-1])  # Immer der LETZTE ```json``` Block
```

---

## 4. Gesamtworkflow: Feature-Lifecycle

```
    User-Idee
        │
        ▼
  ┌─────────────┐
  │  /discovery  │  Fachliche Anforderungen erheben
  └──────┬──────┘
         │ discovery.md
         ▼
  ┌─────────────┐
  │  /wireframe  │  ASCII-Wireframes + UX Review
  └──────┬──────┘
         │ wireframes.md
         │ checks/ux-expert-review.md
         ▼
  ┌──────────────────────────────┐
  │  Gate 0: Discovery↔Wireframe │  Bidirektionale Konsistenz
  └──────┬───────────────────────┘
         │ compliance-discovery-wireframe.md
         ▼
  ┌───────────────┐
  │ /architecture  │  Technische Architektur
  └──────┬────────┘
         │ architecture.md
         ▼
  ┌───────────────────────────────┐
  │  Gate 1: Architecture Compli.  │  Datentypen, Constraints, APIs
  └──────┬────────────────────────┘
         │ compliance-architecture.md
         ▼
  ┌─────────────────────────────┐
  │  /planner oder /slim-planner │  Slice-Erstellung
  └──────┬──────────────────────┘
         │
         ├── FÜR JEDEN SLICE:
         │   ├── slice-writer → slice-{NN}-{slug}.md
         │   └── Gate 2: Slice-Compliance → compliance-slice-{NN}.md
         │
         └── Gate 3: Integration-Map
             ├── integration-map.md
             ├── e2e-checklist.md
             └── orchestrator-config.md
         │
         ▼
  ┌──────────────────────────────────────┐
  │  /orchestrate oder /slim-orchestrate  │
  └──────┬───────────────────────────────┘
         │
         ├── Phase 0: Input-Validierung
         ├── Phase 1: Dependency Pre-Flight
         ├── Phase 2: State-Management
         ├── Phase 3: Worktree + Pre-Scan (Conflict)
         ├── Phase 4: Stack-Detection
         ├── Phase 5: Wave-basierte Implementierung
         │   └── Pro Slice: 6-Step Pipeline
         ├── Phase 6: Final Validation
         ├── Phase 7: Conflict Post-Scan
         └── Phase 8: Feature Complete
```

---

## 5. Commands (Slash-Befehle)

### 5.1 `/clemens:discovery`

**Datei:** `commands/discovery.md`
**Typ:** Rollen-Aktivierung (Session-Mode)
**Agent:** `agents/discovery.md`

**Beschreibung:** Startet eine interaktive Feature-Konzeption. Der Agent führt eine strukturierte Q&A-Session durch und erstellt ein Discovery-Dokument.

**Aufruf:**
```
/clemens:discovery [Kontext oder Feature-Beschreibung]
```

**Phasen des Discovery-Agents:**

| Phase | Aktivität |
|-------|-----------|
| DIVERGE | Recherche (Codebase, Git-History, Web), Optionen erkunden |
| CONVERGE | Scope definieren (IN/OUT), Details ausarbeiten |

**Pflicht-Sections im Output:**
1. Current State Reference
2. UI Patterns
3. User Flow (Start → Steps → End)
4. UI Layout & Context
5. UI Components & States
6. Feature State Machine
7. Business Rules
8. Data Fields
9. Trigger Inventory
10. Implementation Slices

**Output:** `specs/phase-{n}/YYYY-MM-DD-{name}/discovery.md`

**Nächster Schritt:** `/clemens:wireframe {spec_path}`

---

### 5.2 `/clemens:wireframe`

**Datei:** `commands/wireframe.md`
**Typ:** Multi-Phase Pipeline (Wireframe → UX Review → Gate 0)

**Aufruf:**
```
/clemens:wireframe [spec_path]
```

**Phasen:**

| Phase | Aktivität | Agent |
|-------|-----------|-------|
| 1 | Input-Validierung | — (prüft `discovery.md` existiert) |
| 2 | Wireframe-Erstellung | `wireframe` |
| 3 | UX Expert Review + PM-Findings | `ux-expert-review-de` (Sub-Agent via Task) |
| 4 | Gate 0 Compliance Loop | `discovery-wireframe-compliance` (max 9 Retries) |

**Phase 3 Detail — UX Expert Review:**
- Sub-Agent erstellt `checks/ux-expert-review.md`
- Findings werden einzeln dem User via AskUserQuestion präsentiert
- Optionen pro Finding: "Umsetzen" / "Merken für später" / "Ablehnen"
- PM-Review-Frage: Eigene Anmerkungen ergänzen?
- Akzeptierte Findings werden automatisch in wireframes.md/discovery.md eingearbeitet

**Phase 4 Detail — Gate 0 Loop:**
- Compliance-Check mit Fresh Context (Sub-Agent)
- Bei APPROVED → Weiter zu Architecture
- Bei FAILED → Automatischer Fix + erneuter Check (max 9 Retries)
- Discovery-Updates werden vom Command durchgeführt (nicht vom Sub-Agent)

**Output:**
```
{spec_path}/
├── wireframes.md                       # Wireframe-Dokument
├── checks/
│   └── ux-expert-review.md             # UX Review Report
└── compliance-discovery-wireframe.md   # Gate 0 Report
```

**Nächster Schritt:** `/clemens:architecture {spec_path}`

---

### 5.3 `/clemens:architecture`

**Datei:** `commands/architecture.md`
**Typ:** Multi-Phase Pipeline (Architecture → Gate 1)

**Aufruf:**
```
/clemens:architecture [spec_path]
```

**Phasen:**

| Phase | Aktivität | Agent |
|-------|-----------|-------|
| 1 | Input-Validierung | — (prüft `discovery.md` MUST, `wireframes.md` SHOULD) |
| 2 | Architecture-Erstellung | `architecture` (DIVERGE → CONVERGE) |
| 3 | Gate 1 Compliance Loop | `architecture-compliance` (max 3 Retries) |

**Pflicht-Sections im Architecture-Dokument:**
1. Problem & Solution
2. Scope & Boundaries
3. API Design (Endpoints, DTOs, Auth)
4. Database Schema (Typen, Constraints, Indexes)
5. Server Logic (Services, In/Out, Side Effects)
6. Security (Auth, Validation, Rate Limiting)
7. Architecture Layers (Data Flow Diagram)
8. Migration Map (nur bei Refactoring)
9. Constraints & Integrations
10. Quality Attributes (NFRs)
11. Risks & Assumptions

**Gate 1 Spezialität — Realistic Data Check:**
- Evidenz-basierte Datentyp-Validierung
- Codebase-Analyse: Existierende VARCHAR-Längen, UUID-Patterns
- External-API-Analyse: Echte Response-Feldlängen messen
- Empfehlungsmatrix:

| Datentyp | Empfehlung |
|----------|-----------|
| Externe URLs | TEXT (unbekannte Länge) |
| Presigned URLs | TEXT (können sehr lang sein) |
| OAuth Tokens | TEXT (variabel pro Provider) |
| Interne UUIDs | UUID (36 chars) |
| User-Input | VARCHAR(UI-Limit + Buffer) |
| AI/LLM Responses | TEXT (unvorhersagbar) |
| Interne Strings | VARCHAR(2× gemessenes Maximum) |

**Output:**
```
{spec_path}/
├── architecture.md              # Architecture-Dokument
└── compliance-architecture.md   # Gate 1 Report
```

**Nächster Schritt:** `/clemens:planner {spec_path}` oder `/clemens:slim-planner {spec_path}`

---

### 5.4 `/clemens:planner`

**Datei:** `commands/planner.md`
**Typ:** Orchestrierter Slice-Planner mit Gate 2 + Gate 3

**Aufruf:**
```
/clemens:planner [spec_path]
```

**Voraussetzungen:**
- `discovery.md` — REQUIRED
- `architecture.md` — REQUIRED
- `wireframes.md` — OPTIONAL (Warning)
- `compliance-architecture.md` — OPTIONAL (Warning)

**Phasen:**

| Phase | Aktivität | Agent |
|-------|-----------|-------|
| 1 | Input-Validierung | — |
| 2 | Setup & State-Management | — (`.planner-state.json`) |
| 3 | Slice Planning Loop | `slice-writer` + `slice-compliance` (Gate 2) |
| 4 | Gate 3 Integration | `integration-map` |

**Phase 3 — Slice Planning Loop (pro Slice, max 9 Retries):**
```
FOR each slice in discovery.implementation_slices:
  1. Task(slice-writer) → slice-{NN}-{slug}.md     [Fresh Context]
  2. Checkpoint: Datei erstellt?
  3. Task(slice-compliance) → compliance-slice-{NN}.md  [Fresh Context]
  4. IF APPROVED → nächster Slice
     IF FAILED → Retry mit Compliance-Feedback (max 9×)
     IF max Retries → HARD STOP
```

**Phase 4 — Gate 3 (max 9 Retries):**
```
Task(integration-map) mit allen approved Slices
  → integration-map.md
  → e2e-checklist.md
  → orchestrator-config.md
IF "READY FOR ORCHESTRATION" → Status: completed
IF "GAPS FOUND" → Betroffene Slices fixen, Retry
```

**Output:**
```
{spec_path}/
├── slices/
│   ├── slice-01-{slug}.md
│   ├── slice-02-{slug}.md
│   ├── ...
│   ├── compliance-slice-01.md
│   └── compliance-slice-02.md
├── integration-map.md
├── e2e-checklist.md
├── orchestrator-config.md
└── .planner-state.json
```

**Nächster Schritt:** `/clemens:orchestrate {spec_path}`

---

### 5.5 `/clemens:slim-planner`

**Datei:** `commands/slim-planner.md`
**Typ:** Task-Driven Slice-Planner (schlanker als Standard)

**Aufruf:**
```
/clemens:slim-planner [spec_path]
```

**Unterschied zum Standard-Planner:**

| Aspekt | Standard | Slim |
|--------|----------|------|
| Slicer-Phase | Keine (Discovery-Slices direkt) | `slim-slicer` zerlegt in atomare Tasks |
| Slice-Größe | ~1.500+ Zeilen | ~150–300 Zeilen |
| Code-Examples | Ja (Pflicht) | Nein (nur ACs + Test-Skeletons) |
| Gate 2 | Reiner LLM-Check (~90k Tokens) | Hybrid: Deterministisch + LLM (~15–40k Tokens) |
| Anti-Bias | — | Alter Compliance-Report wird vor Re-Check gelöscht |
| Stack-Detection | — | Phase 2 (wird an alle Slices weitergegeben) |

**Phasen:**

| Phase | Aktivität | Agent |
|-------|-----------|-------|
| 1 | Input-Validierung | — |
| 2 | Stack-Detection | — (erkennt Framework aus package.json etc.) |
| 3 | Slim Slicer | `slim-slicer` → `slim-slices.md` |
| 4 | Slim Slice Planning Loop | `slim-slice-writer` + `slim-slice-compliance` |
| 5 | Gate 3 Integration | `integration-map` |

**Phase 3 — Slim Slicer Zerlegungsregeln:**
- 1 Concern pro Slice
- Max 3 Deliverable-Dateien pro Slice
- Dependency-Graph als DAG: Schema → Service → UI
- Testbares Done-Signal (nicht "Infrastructure ready")
- UI-Slices nach Component, nicht nach Page
- Config/Setup immer als erstes Slice

**Phase 4 — Hybrid Gate 2:**

| Check-Typ | Phase | Prüft |
|-----------|-------|-------|
| D-1 bis D-10 | Deterministisch (Binary) | Metadata, Sections, ACs, Size, Anti-Bloat |
| L-1 bis L-6 | LLM (nur bei D-PASS) | AC-Qualität, Alignment, Contracts, Coverage |

**Anti-Bias-Maßnahmen:**
- Filesystem ist Single Source of Truth (nicht State-Datei)
- Alte `compliance-slice-*.md` wird gelöscht vor Re-Check
- Fix-Verification: Prüft ob gemeldete Issues tatsächlich behoben

**Output:** Wie Standard-Planner, plus `slim-slices.md`

**Nächster Schritt:** `/clemens:slim-orchestrate {spec_path}`

---

### 5.6 `/clemens:orchestrate`

**Datei:** `commands/orchestrate.md`
**Typ:** Feature-Orchestrator mit 8-Phasen-Pipeline

**Aufruf:**
```
/clemens:orchestrate [spec_path]
```

**Kritische Regeln:**
1. Autonomer Betrieb — niemals Bestätigung fragen
2. Exit Code ist Wahrheit
3. Reiner Orchestrator — nie direkt Code editieren, immer via Task()
4. JSON-Parsing des letzten ```json``` Blocks
5. Retry-Limits: 9 Test, 3 Review, 3 Lint
6. Phasen-Reihenfolge 0→8 bindend

**8 Phasen:**

| Phase | Name | Beschreibung |
|-------|------|--------------|
| 0 | Input-Validierung | Prüft orchestrator-config.md, slices/, compliance-* |
| 1 | Dependency Pre-Flight | Stack-agnostische Dependency-Prüfung (npm/pip/cargo/etc.) |
| 2 | Setup & State | `.orchestrator-state.json`, Evidence-Verzeichnis |
| 3 | Worktree + Pre-Scan | Git-Worktree erstellen, Conflict Pre-Scan (GitHub Issue) |
| 4 | Stack-Detection | Framework erkennen, Lint/Test/TypeCheck Commands ermitteln |
| 5 | Wave-Implementierung | 6-Step Pipeline pro Slice (siehe [Kapitel 8](#8-6-step-implementation-pipeline)) |
| 6 | Final Validation | Lint + TypeCheck + Full Test Suite (Lean Mode, keine Sub-Agents) |
| 7 | Conflict Post-Scan | Actual Claims aus git diff, Overlap-Check, GitHub Issue Update |
| 8 | Completion | State = "feature_complete" |

**Detail → Kapitel 8 (6-Step Pipeline) und Kapitel 9 (Conflict-Aware)**

**Output:**
```
{spec_path}/
├── .orchestrator-state.json
├── .claude/evidence/{feature}/
│   ├── slice-01.json
│   ├── slice-02.json
│   └── ...
├── predicted-claims.json        # Phase 3
├── claims.json                  # Phase 7
└── overlap-report.json          # Phase 7 (falls Overlap)
```

---

### 5.7 `/clemens:slim-orchestrate`

**Datei:** `commands/slim-orchestrate.md`
**Typ:** Task-Driven Orchestrator (AC-basiert)

**Aufruf:**
```
/clemens:slim-orchestrate [spec_path]
```

**Unterschied zum Standard-Orchestrator:**

| Aspekt | Standard | Slim |
|--------|----------|------|
| Implementer | `slice-implementer` (mit Code-Examples) | `slim-slice-implementer` (nur ACs + Architecture) |
| Code-Reviewer | `code-reviewer` (gegen Code-Examples) | `slim-code-reviewer` (gegen ACs) |
| Gate Log | — | `gate-log.jsonl` (persistentes Tracking) |
| Zusatzregel | — | "Code Review ist binär" explizit |

**Gate Log Format (gate-log.jsonl):**
```json
{
  "ts": "ISO_TIMESTAMP",
  "slice": "slice-01-db",
  "gate": "code_review|lint|tests",
  "verdict": "APPROVED|REJECTED|PASSED|FAILED",
  "attempt": 1,
  "findings_count": 0,
  "findings": []
}
```

Ansonsten identische 8-Phasen-Pipeline.

---

### 5.8 `/clemens:conflict-scan`

**Datei:** `commands/conflict-scan.md`
**Typ:** Manueller Conflict-Scan

**Aufruf:**
```
/clemens:conflict-scan [--branch X] [--spec-path X] [--repo X] [--issue X]
```

**Voraussetzungen:**
- `gh auth status` — GitHub CLI authentifiziert
- `git status` — Git-Repository vorhanden
- Branch bekannt

**Parameter-Ermittlung:**

| Parameter | Manuell | Automatisch |
|-----------|---------|-------------|
| `branch` | `--branch X` | `git branch --show-current` |
| `spec_path` | `--spec-path X` | Suche nach `specs/*/architecture.md` passend zum Branch |
| `repo` | `--repo X` | `gh repo view --json nameWithOwner` |
| `issue_number` | `--issue X` | `gh issue list --label pipeline:running` |

**Ablauf:**
1. Voraussetzungen prüfen
2. Parameter bestimmen
3. `conflict-scanner` Agent aufrufen (mode: "actual")
4. Bei Overlap → `conflict-reporter` Agent triggern

---

### 5.9 `/clemens:debugger`

**Datei:** `commands/debugger.md`
**Typ:** Rollen-Aktivierung (Session-Mode)
**Agent:** `agents/debugger.md`

**Aufruf:**
```
/clemens:debugger [Fehlerbeschreibung oder Kontext]
```

**Workflow (Wissenschaftliche Methode):**
1. Bug analysieren
2. Hypothese aufstellen
3. Instrumentierung (temporäres `[DEBUG-AI]` Logging)
4. Hypothese validieren mit Daten
5. Root Cause identifizieren
6. Minimaler, chirurgischer Fix
7. Debug-Logs entfernen

**Regel:** Nie spekulieren — immer mit Daten/Logs beweisen.

---

### 5.10 `/clemens:qa-manual`

**Datei:** `commands/qa-manual.md`
**Typ:** Rollen-Aktivierung (Session-Mode)
**Agent:** `agents/qa-manual.md`

**Aufruf:**
```
/clemens:qa-manual [Scope oder Feature-Name]
```

**Workflow:**
1. Discovery/Plan-Dokumente finden, Roadmap lesen
2. User nach Scope fragen (alle Features / spezifisch / custom)
3. Features im Code recherchieren (UI, APIs, Logs)
4. Pro Thema: Test-Szenario → User testet → Bug dokumentieren
5. Bug-Logs: `specs/{phase}/BUG-{slug}.md`
6. QA Session Summary

---

### 5.11 `/clemens:roadmap`

**Datei:** `commands/roadmap.md`
**Typ:** Rollen-Aktivierung (Session-Mode)
**Agent:** `agents/roadmap.md`

**Aufruf:**
```
/clemens:roadmap [Kontext]
```

**Vier Rollen des Agents:**

| Rolle | Aufgabe |
|-------|---------|
| Navigator | Orientierung & Richtung |
| Priorisierer | Must-have vs. Nice-to-have |
| Analyst | Gap-Analyse, Progress-Messung |
| Sparring-Partner | Kritische Reflexion |

**Artefakte:** `docs/product/{vision.md, phases.md, roadmap.md}`

---

### 5.12 `/clemens:pm-ux-review-de`

**Datei:** `commands/pm-ux-review-de.md`
**Typ:** Multi-Phase Pipeline (Review → Findings → Umsetzung)

**Aufruf:**
```
/clemens:pm-ux-review-de [spec_path]
```

**Phasen:**

| Phase | Aktivität |
|-------|-----------|
| 1 | Input-Validierung (discovery.md + wireframes.md) |
| 2 | Versioning-Check (automatisch v2, v3, ...) |
| 3 | UX Expert Review (Sub-Agent via Task) |
| 4 | Findings einzeln präsentieren (AskUserQuestion) |
| 5 | Akzeptierte Findings umsetzen (Read vor Edit) |

**Finding-Optionen:**
- "Umsetzen" → Discovery/Wireframe sofort anpassen
- "Merken für später" → Im Report belassen
- "Ablehnen" → Finding ignorieren

**Mandatory PM-Review:** Nach allen Findings werden eigene Anmerkungen des PMs abgefragt.

---

## 6. Agents (Sub-Agents)

### 6.1 Discovery & Konzeption

#### `discovery` — Feature-Konzeption

**Datei:** `agents/discovery.md`
**Tools:** Read, Grep, Glob, WebSearch, Edit, Write, AskUserQuestion, Bash (git log/show/diff)

- DIVERGE: Recherche, Codebase, Git-History, Web
- CONVERGE: Scope (IN/OUT) → Details (10 Pflicht-Sections)
- Delta-Prinzip: Nur Änderungen/Neues dokumentieren
- Q&A-Log als Tabelle

#### `wireframe` — ASCII-Wireframes

**Datei:** `agents/wireframe.md`
**Tools:** Read, Write, Glob, AskUserQuestion

- Input: `discovery.md` (UI Layout & Context, UI Components)
- ASCII-Elemente: `┌─┐│└─┘`, `───`, `═══`
- Annotations: ①②③... (max 20 pro Screen, Neustart pro Screen)
- State-Variationen: Tabelle (volles Wireframe nur bei Layout-Änderung)

#### `architecture` — Technische Architektur

**Datei:** `agents/architecture.md`
**Tools:** Read, Grep, Glob, WebSearch, Edit, Write, AskUserQuestion, Bash (git)

- Stack-agnostisch: Patterns statt Framework-Namen
- External Dependencies: BLOCKING wenn Versionen fehlen ("Latest" verboten)
- Migration Map: BLOCKING wenn Scope Migration erwähnt, aber keine Map

#### `ux-expert-review-de` — Senior UX Review

**Datei:** `agents/ux-expert-review-de.md`
**Tools:** Read, Glob, Grep

- Expertise-driven, nicht Checklist-driven
- Bereiche: Enterprise/B2B, E-Commerce, IA, Interaction Design, Nielsen Heuristics
- Verdict: APPROVED (0 Critical + 0 Improvement) oder CHANGES_REQUESTED

#### `roadmap` — Strategische Planung

**Datei:** `agents/roadmap.md`
**Tools:** Read, Grep, Glob, WebSearch, mcp__github__list_issues, mcp__github__list_pull_requests, AskUserQuestion

---

### 6.2 Quality Gates

#### `discovery-wireframe-compliance` — Gate 0

**Datei:** `agents/discovery-wireframe-compliance.md`
**Prüft:** Bidirektionale Konsistenz Discovery ↔ Wireframes

| Richtung | Prüfung | Severity |
|----------|---------|----------|
| Discovery → Wireframe | Jeder User-Flow hat Screens? Jeder UI-State hat Variation? | ❌ BLOCKING |
| Wireframe → Discovery | Visuelle Specs zurückfließen (Aspect Ratios, Limits) | 🔧 AUTO-FIX |

**Output:** `compliance-discovery-wireframe.md`

#### `architecture-compliance` — Gate 1

**Datei:** `agents/architecture-compliance.md`
**Prüft:**

| Check | Beschreibung |
|-------|-------------|
| Feature Mapping | Jedes Discovery-Feature hat Architecture-Section |
| Constraint Mapping | UI-Constraints (Aspect Ratios, Feldlängen) übertragen |
| Realistic Data | Datentypen evidenz-basiert (Codebase + External APIs) |
| External Dependencies | Versionen gepinnt, Rate Limits dokumentiert |
| Migration Completeness | Dateipfade (nicht Verzeichnisse), testbare Target Patterns |

**Output:** `compliance-architecture.md`

#### `slice-compliance` — Gate 2 (Standard)

**Datei:** `agents/slice-compliance.md`
**Prüft:**

| Check | Beschreibung |
|-------|-------------|
| A) Architecture | Schema-Typen, API-Endpoints, DTOs, Security |
| B) Wireframe | UI-Elemente, States, Visual Specs |
| C) Integration Contract | Dependencies, Outputs, Consumer-Deliverable Traceability |
| D) Code Examples | Vollständig, architektur-konform, ausführbar |
| E) Build Config | devDependencies registriert, IIFE/UMD korrekt |
| F) Test Coverage | ACs definiert, Tests gemapped |
| G) LLM Boundary | Schema-Validierung, Fallback-Logik (wenn LLM-Calls) |
| H) Framework Patterns | Shared Layout, Client Component Wrapper, Proxy Route |
| I) Discovery | UI Components, State Machine, Business Rules |

**Output:** `compliance-slice-{NN}.md`

#### `slim-slice-compliance` — Gate 2 (Hybrid)

**Datei:** `agents/slim-slice-compliance.md`
**Prüft in zwei Phasen:**

**Phase 2 — Deterministische Checks (Binary PASS/FAIL):**

| Check | Validiert |
|-------|-----------|
| D-1 | Metadata (4 Felder: ID, Test, E2E, Dependencies) |
| D-2 | Test-Strategy (7 Felder: Stack, Commands, Health, Mocking) |
| D-3 | AC-Format (min 1 AC mit GIVEN/WHEN/THEN) |
| D-4 | Test Skeletons (Anzahl ≥ AC-Anzahl) |
| D-5 | Integration Contract (Requires + Provides Tabellen) |
| D-6 | Deliverables (Marker + Dateipfade) |
| D-7 | Constraints Section (≥1 Constraint) |
| D-8 | Size (<500 Zeilen, Warning >400, Blocking >600) |
| D-9 | Anti-Bloat (Keine Code-Examples, ASCII, DB-Schema) |
| D-10 | Codebase-Referenz (Methoden existieren für MODIFY-Deliverables) |

**Phase 3 — LLM Content Checks (nur bei Phase 2 PASS):**

| Check | Validiert |
|-------|-----------|
| L-1 | AC-Qualität (testbar, spezifisch, messbar) |
| L-2 | Architecture Alignment |
| L-3 | Contract Consistency |
| L-4 | Deliverable Coverage |
| L-5 | Discovery Compliance |
| L-6 | Consumer Coverage |

**Anti-Bias:** Liest KEINE vorherigen compliance-slice-*.md Dateien.

#### `integration-map` — Gate 3

**Datei:** `agents/integration-map.md`
**Tools:** Read, Write, Glob, Grep

**Prüft:**
- Connection Validation (Inputs haben Outputs)
- Orphan Detection (Outputs haben Consumers)
- Gap Detection (fehlende Inputs/Dependencies)
- Deliverable-Consumer Traceability
- Discovery Traceability (100% Coverage)
- Runtime Path Analysis (vollständige Call Chains)
- Semantic Consistency (Method Surfaces, Return Types)
- Infrastructure Prerequisites (Health Endpoints)

**Output:**
- `integration-map.md` — Dependency Graph + Validierung
- `e2e-checklist.md` — Testplan
- `orchestrator-config.md` — Waves, Reihenfolge, Rollback

**Verdict:** "READY FOR ORCHESTRATION" oder "GAPS FOUND"

---

### 6.3 Planning & Slice-Erstellung

#### `slim-slicer` — Atomare Zerlegung

**Datei:** `agents/slim-slicer.md`
**Tools:** Read, Grep, Glob, Write

**Zerlegungsregeln:**
1. 1 Concern pro Slice
2. Max 3 Deliverable-Dateien
3. Dependency-Graph als DAG (Schema → Service → UI)
4. Testbares Done-Signal
5. UI nach Component, nicht nach Page
6. Config/Setup als erstes Slice
7. Visual Mount ≠ Functional Wiring (Data Flow muss in Slice)

**Output:** `{spec_path}/slim-slices.md`

#### `slice-writer` — Standard-Slice-Specs

**Datei:** `agents/slice-writer.md`
**Tools:** Read, Grep, Glob, Edit, Write, WebSearch, mcp__tavily, AskUserQuestion

**Pflicht-Sections:**
- Metadata, Test-Strategy, Integration Contract
- **Code Examples (MANDATORY)** — Gate 2 prüft diese
- ACs (GIVEN/WHEN/THEN), Testfälle, Deliverables, Constraints

#### `slim-slice-writer` — Schlanke Slice-Specs

**Datei:** `agents/slim-slice-writer.md`
**Tools:** Read, Grep, Glob, Edit, Write, WebSearch, mcp__tavily, AskUserQuestion

**Unterschied:** Keine Code-Examples, nur ACs + Test-Skeletons (`it.todo()`), ~150–300 Zeilen, Architecture-Referenzen statt Kopien.

**Verbotene Anti-Patterns:**
- ❌ Code-Examples mit Implementation
- ❌ ASCII-Wireframes kopiert
- ❌ DB-Schema kopiert
- ❌ Vollständige Type-Definitions
- ❌ Tests mit Assertions
- ❌ Prosa-Erklärungen

---

### 6.4 Implementation

#### `slice-implementer` — Standard-Implementierung

**Datei:** `agents/slice-implementer.md`
**Tools:** Read, Edit, Write, Bash

**Regeln:**
- Implementiert exakt EINEN Slice
- Keine Tests (macht `test-writer`)
- Signatur-Schutz: Alle Caller im gesamten Codebase finden (inkl. Tests)
- Branch-Validierung vor Commit (HARD STOP wenn main/master)
- Working-Directory als Pflicht-Parameter

#### `slim-slice-implementer` — Task-Driven-Implementierung

**Datei:** `agents/slim-slice-implementer.md`
**Tools:** Read, Edit, Write, Bash

**Unterschied:** Keine Code-Examples, liest Architecture-Referenzen aus Constraints, trifft eigene Datei-Level-Entscheidungen.

---

### 6.5 Review & Testing

#### `code-reviewer` — Adversarial Code-Review

**Datei:** `agents/code-reviewer.md`
**Tools:** Read, Grep, Glob, Bash (git diff/log/show)

**Workflow:**
1. Spec lesen (Deliverables, ACs, Code Examples, Integration Contracts)
2. Architecture lesen
3. `git diff HEAD~1` ausführen
4. Analysieren gegen 4 Kategorien:
   - Spec-Compliance (alle ACs, alle Deliverables)
   - Architecture-Compliance (Patterns, Layers, Data Flow)
   - Code-Quality (Bugs, Security, Resource Leaks)
   - Anti-Patterns (Hardcoded Values, Race Conditions)

**Verdict:** 0 Findings = APPROVED, ≥1 Finding = REJECTED (binär)

#### `slim-code-reviewer` — AC-basierter Review

**Datei:** `agents/slim-code-reviewer.md`
**Unterschied:** Prüft gegen ACs + Architecture statt gegen Code-Examples.

#### `test-writer` — Test-Generierung

**Datei:** `agents/test-writer.md`
**Tools:** Read, Glob, Grep, Bash, Write
**Model:** Opus

**Test-Typen:**
- Unit, Integration, Acceptance (1:1 aus GIVEN/WHEN/THEN)
- Adversarial (für LLM-Calls)
- Interaction (für Frontend)

**Mocking:** Default NO mocks (echte Instanzen). Override via Slice-Spec `Test-Strategy`.

**Pflicht:** 100% AC-Coverage (`ac_coverage.total == ac_coverage.covered`)

#### `test-validator` — Test-Ausführung

**Datei:** `agents/test-validator.md`
**Tools:** Bash, Read, Glob, Grep

**Stages (sequenziell, Abbruch bei Failure):**

| Stage | Beschreibung |
|-------|-------------|
| Unit | Unit-Tests ausführen |
| Integration | Integration-Tests |
| Acceptance | Acceptance-Tests |
| Smoke | Health-Endpoint pollen, Chrome DevTools optional, App stoppen |
| Regression | Vorherige Slices testen |

**Final Validation Mode:** Zusätzlich Lint Auto-Fix + TypeCheck + Build

---

### 6.6 Conflict-Aware Pipeline

#### `conflict-scanner` — Zwei-Phasen-Scan

**Datei:** `agents/conflict-scanner.md`
**Tools:** Read, Glob, Grep, Bash (gh, git), Write

**Mode: "predict" (Pre-Scan, Phase 3 des Orchestrators):**
1. File-Level Claims aus Spec-Deliverables extrahieren
2. `predicted-claims.json` schreiben
3. GitHub Issue erstellen (Label: `pipeline:running`)
4. Andere laufende Sessions lesen (`gh issue list --label pipeline:running`)
5. File-Level Overlaps berechnen
6. Overlap-Kommentare auf Issues posten

**Mode: "actual" (Post-Scan, Phase 7 des Orchestrators):**
1. `git diff main...{branch}` ausführen
2. Entity-Level Changes extrahieren (Funktionen, Klassen, Methoden aus Hunk Headers)
3. `claims.json` schreiben
4. Entity-Level Overlaps berechnen
5. `overlap-report.json` schreiben
6. GitHub Issue Body aktualisieren

#### `conflict-reporter` — GitHub-Kommentare

**Datei:** `agents/conflict-reporter.md`
**Tools:** Read, Bash (gh issue comment)

- Liest `overlap-report.json`
- Erstellt menschenlesbare Markdown-Kommentare
- Postet auf eigene Issue + alle betroffenen Issues
- Analyse: Severity, Kontext, Empfehlung

---

### 6.7 Utility-Agents

#### `debugger` — Systematische Fehlersuche

**Datei:** `agents/debugger.md`
**Tools:** Read, Grep, Glob, Bash, Edit, AskUserQuestion

**Methode:** Hypothese → `[DEBUG-AI]` Logging → Daten-Validierung → Root Cause → Fix → Cleanup

#### `qa-manual` — Geführtes Feature-Testing

**Datei:** `agents/qa-manual.md`
**Tools:** Read, Grep, Glob, Bash, Write, AskUserQuestion

**Output:** Bug-Logs + QA Session Summary

---

## 7. Quality Gates im Detail

```
Gate 0                Gate 1               Gate 2              Gate 3
Discovery ↔          Architecture ↔       Slice ↔ Arch +      Integration
Wireframe            Discovery +          Wireframe +         aller Slices
                     Wireframe +          Discovery
                     Realistic Data
     │                    │                   │                   │
     ▼                    ▼                   ▼                   ▼
compliance-         compliance-          compliance-         integration-map.md
discovery-          architecture.md      slice-{NN}.md       e2e-checklist.md
wireframe.md                                                 orchestrator-config.md
```

| Gate | Wann | Agent | Max Retries | Trigger |
|------|------|-------|-------------|---------|
| 0 | Nach Wireframe | `discovery-wireframe-compliance` | 9 | `/wireframe` |
| 1 | Nach Architecture | `architecture-compliance` | 3 | `/architecture` |
| 2 | Pro Slice | `slice-compliance` / `slim-slice-compliance` | 9 | `/planner` / `/slim-planner` |
| 3 | Nach allen Slices | `integration-map` | 9 | `/planner` / `/slim-planner` |

**Verdicts:**
- Gate 0–2: `APPROVED` oder `FAILED`
- Gate 3: `READY FOR ORCHESTRATION` oder `GAPS FOUND`

---

## 8. 6-Step Implementation Pipeline

Wird pro Slice innerhalb des Orchestrators ausgeführt:

```
┌──────────────────────────────────────────────────────────────────────┐
│ SLICE-{NN}                                                           │
│                                                                      │
│  Step 1: IMPLEMENTER                                                 │
│  ├─ Liest: Slice-Spec + Architecture + Integration-Map              │
│  ├─ Implementiert Deliverables                                       │
│  ├─ Prüft Integration Contracts                                      │
│  ├─ Commit                                                           │
│  └─ Output: { status, files_changed[], commit_hash }                │
│         │                                                            │
│         ▼                                                            │
│  Step 2: CODE REVIEW (max 3 Retries)                                │
│  ├─ git diff HEAD~1                                                  │
│  ├─ Prüft: Spec, Architecture, Quality, Anti-Patterns               │
│  ├─ Verdict: APPROVED → Step 3                                       │
│  ├─ Verdict: REJECTED → Debugger Fix → Retry                        │
│  └─ 3× REJECTED → HARD STOP                                         │
│         │                                                            │
│         ▼                                                            │
│  Step 3: DETERMINISTIC GATE (max 3 Retries)                         │
│  ├─ Lint Auto-Fix (einmalig)                                        │
│  ├─ Lint Check → exit_code 0?                                       │
│  ├─ TypeCheck → exit_code 0?                                        │
│  ├─ Bei Failure → Debugger Fix → Retry                              │
│  └─ 3× Failure → HARD STOP                                          │
│         │                                                            │
│         ▼                                                            │
│  Step 4: TEST WRITER                                                 │
│  ├─ Liest Slice-Spec ACs                                             │
│  ├─ Generiert: Unit + Integration + Acceptance Tests                 │
│  ├─ AC Coverage Check: total == covered (100% Pflicht)              │
│  ├─ Commit                                                           │
│  └─ Output: { test_files[], test_count, ac_coverage }               │
│         │                                                            │
│         ▼                                                            │
│  Step 5: TEST VALIDATOR (max 9 Retries)                             │
│  ├─ Stage 1: Unit Tests                                              │
│  ├─ Stage 2: Integration Tests                                       │
│  ├─ Stage 3: Acceptance Tests                                        │
│  ├─ Stage 4: Smoke Test (Health Endpoint + optional Chrome DevTools) │
│  ├─ Stage 5: Regression (vorherige Slices)                          │
│  ├─ Bei Failure → Debugger Fix → Retry                              │
│  └─ 9× Failure → HARD STOP                                          │
│         │                                                            │
│         ▼                                                            │
│  Step 6: EVIDENCE SAVING                                             │
│  └─ .claude/evidence/{slice_id}.json                                │
│     { implementation, review, gate, tests, validation, retries }    │
└──────────────────────────────────────────────────────────────────────┘
```

**Wave-Verarbeitung:**
```
orchestrator-config.md definiert:
  Wave 1: [slice-01, slice-02]  ← Keine Dependencies, Basis
  Wave 2: [slice-03, slice-04]  ← Abhängig von Wave 1
  Wave 3: [slice-05]            ← Abhängig von Wave 2

FOR each wave IN waves:
  FOR each slice IN wave.slices:
    Führe 6-Step Pipeline aus
    HARD STOP bei Failure → Pipeline stoppt
```

---

## 9. Conflict-Aware Pipeline

### Zwei-Phasen-Claims-Modell

```
Phase 3 (Pre-Scan)                    Phase 7 (Post-Scan)
─────────────────                     ──────────────────
Vor Implementierung                   Nach Implementierung

Predicted Claims                      Actual Claims
(aus Spec-Deliverables)               (aus git diff)

File-Level:                           Entity-Level:
"src/api/projects.ts" (create)        "src/api/projects.ts::createProject" (function)
"src/db/schema.sql" (modify)          "src/db/schema.sql::projects_table" (table)

predicted-claims.json                 claims.json
                                      overlap-report.json
```

### GitHub Issue als Session-Registry

```
┌─────────────────────────────────────────────┐
│ Issue: "Pipeline: feature-gallery"          │
│ Labels: pipeline:running                    │
│                                             │
│ Body:                                       │
│ ```json                                     │
│ { session metadata }                        │
│ ```                                         │
│ ```json                                     │
│ { predicted_claims / actual_claims }        │
│ ```                                         │
│                                             │
│ Comments:                                   │
│ ├─ "⚠️ Overlap mit Issue #45: 3 Dateien"   │
│ └─ "📊 Entity-Overlap: createProject()"    │
└─────────────────────────────────────────────┘
```

**Label-Lifecycle:**
- Phase 3: `pipeline:running` (Issue erstellt)
- Phase 7: `pipeline:running` → `pipeline:merge-ready` (nach Post-Scan)

---

## 10. JSON-Contracts (Input/Output)

### Slice-Implementer

```json
{
  "status": "completed|failed",
  "files_changed": ["src/api/projects.ts", "src/db/schema.sql"],
  "commit_hash": "abc1234",
  "notes": "Optional"
}
```

### Code-Reviewer

```json
{
  "verdict": "APPROVED|REJECTED",
  "findings": [
    {
      "file": "src/api/projects.ts",
      "line": 42,
      "message": "Missing input validation for project name",
      "fix_suggestion": "Add zod schema validation"
    }
  ],
  "summary": "APPROVED — no issues found"
}
```

### Test-Writer

```json
{
  "status": "completed|failed",
  "test_files": [
    "tests/unit/projects.test.ts",
    "tests/integration/projects-api.test.ts",
    "tests/acceptance/create-project.test.ts"
  ],
  "test_count": { "unit": 5, "integration": 2, "acceptance": 3 },
  "ac_coverage": { "total": 3, "covered": 3, "missing": [] },
  "commit_hash": "def5678"
}
```

### Test-Validator

```json
{
  "overall_status": "passed|failed",
  "stages": {
    "unit": { "exit_code": 0, "duration_ms": 1200, "summary": "12 passed" },
    "integration": { "exit_code": 0, "duration_ms": 3400, "summary": "5 passed" },
    "acceptance": { "exit_code": 0, "duration_ms": 2100, "summary": "3 passed" },
    "smoke": {
      "app_started": true,
      "health_status": 200,
      "startup_duration_ms": 4500
    },
    "regression": { "exit_code": 0, "slices_tested": ["slice-01", "slice-02"] }
  },
  "failed_stage": null,
  "error_output": null
}
```

### Debugger

```json
{
  "status": "completed|unable_to_fix",
  "root_cause": "Missing null check in project service",
  "fix_applied": "Added null guard before DB query",
  "notes": "Also fixed related edge case"
}
```

### Conflict-Scanner (Pre-Scan)

```json
{
  "status": "completed|failed",
  "has_overlap": false,
  "issue_number": 42,
  "files_claimed": 5,
  "overlaps": [],
  "notes": "No overlaps detected"
}
```

### Conflict-Scanner (Post-Scan)

```json
{
  "status": "completed|failed",
  "has_overlap": true,
  "overlaps": [
    { "file": "src/api/projects.ts", "entity": "createProject", "issue": 45 }
  ],
  "entities_changed": 7,
  "notes": "2 entity-level overlaps found"
}
```

### Conflict-Reporter

```json
{
  "status": "completed|failed",
  "commented": true,
  "issues_commented": [42, 45],
  "notes": "Posted overlap analysis to 2 issues"
}
```

### Predicted-Claims (Datei)

```json
{
  "files_claimed": [
    { "file": "src/api/projects.ts", "action": "modify", "source_slice": "slice-01" },
    { "file": "src/db/migrations/001.sql", "action": "create", "source_slice": "slice-01" }
  ],
  "summary": { "files_claimed": 5, "new_files": 2, "modified_files": 3 }
}
```

### Actual-Claims (Datei)

```json
{
  "entities_changed": [
    {
      "file": "src/api/projects.ts",
      "entity": "createProject",
      "entity_type": "function",
      "lines": [42, 87],
      "diff_summary": "+9 -3"
    }
  ],
  "summary": { "files_changed": 3, "entities_changed": 7, "new_files": 1 }
}
```

---

## 11. Templates

| Template | Datei | Verwendet von |
|----------|-------|--------------|
| Discovery | `templates/discovery-feature.md` | `discovery` Agent |
| Architecture | `templates/architecture-feature.md` | `architecture` Agent |
| Wireframe | `templates/wireframe-template.md` | `wireframe` Agent |
| Slice-Spec (Standard) | `templates/plan-spec.md` | `slice-writer` Agent |
| Slice-Spec (Slim) | `templates/slim-plan-spec.md` | `slim-slice-writer` Agent |
| Roadmap | `templates/roadmap.md` | `roadmap` Agent |
| Project | `templates/project.md` | Projekt-Kontext |
| Summary | `templates/summary.md` | Feature-Zusammenfassung |
| Checkpoint | `templates/checkpoint-example.md` | Checkpoint-Dokumentation |
| UI-Checklist | `templates/ui-implementation-checklist.md` | UI-Implementierung |
| Weave Setup | `templates/weave-setup.md` | Weave CLI + rerere Installation |

---

## 12. State-Management & Resume

### Planner State (`.planner-state.json` / `.slim-planner-state.json`)

```json
{
  "spec_path": "specs/2026-03-01-feature",
  "status": "in_progress|completed|failed",
  "phase": "slice_planning|gate_3_integration|completed",
  "total_slices": 6,
  "current_slice_index": 3,
  "slices": [
    { "number": 1, "name": "db-schema", "status": "approved", "retries": 0 },
    { "number": 2, "name": "service", "status": "approved", "retries": 1 },
    { "number": 3, "name": "ui", "status": "in_progress", "retries": 0 }
  ],
  "approved_slices": [1, 2],
  "failed_slices": [],
  "detected_stack": "typescript-nextjs",
  "last_action": "Slice 2 approved",
  "last_updated": "2026-03-01T14:30:00Z"
}
```

**Resume-Verhalten:**
- `in_progress` → Weiter ab `current_slice_index`
- `completed` → STOP (manuelles Löschen für Neustart)
- `failed` → STOP (manuelle Intervention nötig)

**Slim-Planner Anti-Bias Recovery:**
```
IF status == "in_progress":
  Lese alle compliance-slice-*.md vom Filesystem
  Vergleiche mit state.approved_slices
  Bei Diskrepanz → Filesystem gewinnt
```

### Orchestrator State (`.orchestrator-state.json`)

```json
{
  "spec_path": "specs/2026-03-01-feature",
  "current_state": "implementing|code_review|...|feature_complete",
  "retry_count": 0,
  "failed_stage": null,
  "completed_slices": ["slice-01", "slice-02"],
  "current_slice": "slice-03",
  "issue_number": 42,
  "detected_stack": { "stack_name": "typescript-nextjs", "..." : "..." }
}
```

**Orchestrator States:**
`pre_check` → `worktree_setup` → `pre_scan` → `implementing` → `code_review` → `deterministic_gate` → `writing_tests` → `validating` → `auto_fixing` → `slice_complete` → `final_validation` → `conflict_scan` → `conflict_report` → `feature_complete`

---

## 13. Retry-Logik

| Kontext | Was | Max Retries | Bei Erschöpfung |
|---------|-----|-------------|-----------------|
| Orchestrator | Code Review | 3 | HARD STOP |
| Orchestrator | Lint/TypeCheck | 3 | HARD STOP |
| Orchestrator | Test Validation | 9 | HARD STOP |
| Orchestrator | Final Validation Lint | 3 | HARD STOP |
| Orchestrator | Final Validation Tests | 9 | HARD STOP |
| Planner | Slice Gate 2 | 9 | HARD STOP |
| Planner | Gate 3 Integration | 9 | HARD STOP |
| Wireframe | Gate 0 | 9 | HARD STOP |
| Architecture | Gate 1 | 3 | HARD STOP |

**Retry-Ablauf:**
1. Failure erkannt (Exit Code ≠ 0 oder Verdict: REJECTED/FAILED)
2. `retry_count++`
3. Wenn `retry_count < max` → Debugger/Fixer aufrufen → erneuter Versuch
4. Wenn `retry_count >= max` → HARD STOP mit Fehlerbericht

---

## 14. Stack-Erkennung

Der Orchestrator und Slim-Planner erkennen den Tech-Stack automatisch:

| Indicator-Datei | Stack | Lint | TypeCheck | Test | Start |
|----------------|-------|------|-----------|------|-------|
| `package.json` + `next` | typescript-nextjs | `npx next lint --fix` | `npx tsc --noEmit` | `pnpm test` | `pnpm dev` |
| `package.json` + `express` | typescript-express | `npx eslint --fix .` | `npx tsc --noEmit` | `pnpm test` | `node server.js` |
| `package.json` + `vue` | typescript-vue | `npx eslint --fix .` | `npx vue-tsc --noEmit` | `pnpm test` | `pnpm dev` |
| `pyproject.toml` + `fastapi` | python-fastapi | `ruff check --fix .` | `mypy .` | `python -m pytest` | `uvicorn app.main:app` |
| `go.mod` | go | `golangci-lint run --fix` | — (kompiliert) | `go test ./...` | `go run .` |
| `Cargo.toml` | rust | `cargo clippy --fix` | — (kompiliert) | `cargo test` | `cargo run` |
| `composer.json` + `laravel` | php-laravel | `./vendor/bin/pint` | `./vendor/bin/phpstan` | `php artisan test` | `php artisan serve` |
| `Gemfile` + `rails` | ruby-rails | `rubocop -A` | — | `bundle exec rspec` | `rails server` |

---

## 15. Datei-Artefakte pro Phase

### Nach `/clemens:discovery`
```
specs/phase-{n}/YYYY-MM-DD-{name}/
└── discovery.md
```

### Nach `/clemens:wireframe`
```
specs/.../
├── discovery.md                        # ggf. aktualisiert
├── wireframes.md                       # NEU
├── checks/
│   └── ux-expert-review.md             # NEU
└── compliance-discovery-wireframe.md   # NEU (Gate 0)
```

### Nach `/clemens:architecture`
```
specs/.../
├── discovery.md
├── wireframes.md
├── compliance-discovery-wireframe.md
├── architecture.md                     # NEU
└── compliance-architecture.md          # NEU (Gate 1)
```

### Nach `/clemens:planner`
```
specs/.../
├── discovery.md
├── wireframes.md
├── architecture.md
├── compliance-*.md
├── slices/
│   ├── slice-01-{slug}.md              # NEU
│   ├── slice-02-{slug}.md              # NEU
│   ├── compliance-slice-01.md          # NEU (Gate 2)
│   ├── compliance-slice-02.md          # NEU (Gate 2)
│   └── ...
├── integration-map.md                  # NEU (Gate 3)
├── e2e-checklist.md                    # NEU (Gate 3)
├── orchestrator-config.md              # NEU (Gate 3)
└── .planner-state.json                 # State
```

### Nach `/clemens:slim-planner` (zusätzlich)
```
specs/.../
├── slim-slices.md                      # NEU (Slicer-Output)
└── .slim-planner-state.json            # State
```

### Nach `/clemens:orchestrate`
```
{project}/
├── src/...                             # Implementierter Code
├── tests/...                           # Generierte Tests
├── .orchestrator-state.json            # State
├── .claude/evidence/{feature}/
│   ├── slice-01.json                   # Evidence
│   └── slice-02.json
├── predicted-claims.json               # Pre-Scan
├── claims.json                         # Post-Scan
├── overlap-report.json                 # Falls Overlap
└── gate-log.jsonl                      # Nur Slim-Orchestrator
```

---

## Anhang: Agent-Inventar (Komplett)

| # | Agent | Datei | Tools | Aufgerufen von |
|---|-------|-------|-------|----------------|
| 1 | discovery | agents/discovery.md | Read, Grep, Glob, WebSearch, Edit, Write, AskUser, Bash(git) | `/discovery` |
| 2 | wireframe | agents/wireframe.md | Read, Write, Glob, AskUser | `/wireframe` |
| 3 | architecture | agents/architecture.md | Read, Grep, Glob, WebSearch, Edit, Write, AskUser, Bash(git) | `/architecture` |
| 4 | ux-expert-review-de | agents/ux-expert-review-de.md | Read, Glob, Grep | `/wireframe`, `/pm-ux-review-de` |
| 5 | roadmap | agents/roadmap.md | Read, Grep, Glob, WebSearch, GitHub Issues/PRs, AskUser | `/roadmap` |
| 6 | discovery-wireframe-compliance | agents/discovery-wireframe-compliance.md | All tools | `/wireframe` (Gate 0) |
| 7 | architecture-compliance | agents/architecture-compliance.md | All tools | `/architecture` (Gate 1) |
| 8 | slice-compliance | agents/slice-compliance.md | Read, Write, Glob | `/planner` (Gate 2) |
| 9 | slim-slice-compliance | agents/slim-slice-compliance.md | Read, Write, Glob, Grep | `/slim-planner` (Gate 2) |
| 10 | integration-map | agents/integration-map.md | Read, Write, Glob, Grep | `/planner`, `/slim-planner` (Gate 3) |
| 11 | slim-slicer | agents/slim-slicer.md | Read, Grep, Glob, Write | `/slim-planner` |
| 12 | slice-writer | agents/slice-writer.md | Read, Grep, Glob, Edit, Write, WebSearch, Tavily, AskUser | `/planner` |
| 13 | slim-slice-writer | agents/slim-slice-writer.md | Read, Grep, Glob, Edit, Write, WebSearch, Tavily, AskUser | `/slim-planner` |
| 14 | slice-implementer | agents/slice-implementer.md | Read, Edit, Write, Bash | `/orchestrate` |
| 15 | slim-slice-implementer | agents/slim-slice-implementer.md | Read, Edit, Write, Bash | `/slim-orchestrate` |
| 16 | code-reviewer | agents/code-reviewer.md | Read, Grep, Glob, Bash(git) | `/orchestrate` |
| 17 | slim-code-reviewer | agents/slim-code-reviewer.md | Read, Grep, Glob, Bash(git) | `/slim-orchestrate` |
| 18 | test-writer | agents/test-writer.md | Read, Glob, Grep, Bash, Write | `/orchestrate`, `/slim-orchestrate` |
| 19 | test-validator | agents/test-validator.md | Bash, Read, Glob, Grep | `/orchestrate`, `/slim-orchestrate` |
| 20 | debugger | agents/debugger.md | Read, Grep, Glob, Bash, Edit, AskUser | `/debugger`, Orchestrators |
| 21 | conflict-scanner | agents/conflict-scanner.md | Read, Glob, Grep, Bash(gh, git), Write | `/orchestrate`, `/slim-orchestrate`, `/conflict-scan` |
| 22 | conflict-reporter | agents/conflict-reporter.md | Read, Bash(gh) | `/orchestrate`, `/slim-orchestrate`, `/conflict-scan` |
| 23 | qa-manual | agents/qa-manual.md | Read, Grep, Glob, Bash, Write, AskUser | `/qa-manual` |

---

*Dokumentation generiert am 2026-03-12 für Plugin-Version 1.3.4*
