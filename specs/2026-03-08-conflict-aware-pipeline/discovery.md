# Feature: Conflict-Aware Agent Pipeline

**Epic:** Pipeline Externalization & Multi-Session Coordination
**Status:** Ready
**Wireframes:** -- (tooling feature, no UI)

---

## Problem & Solution

**Problem:**
- Mehrere Pipeline-Sessions (gleicher Dev, Multi-Session ODER verschiedene Devs) arbeiten parallel am selben Repo
- Jede Session plant und implementiert Aenderungen an Dateien ohne zu wissen, dass andere Sessions die gleichen Dateien/Entities anfassen
- Merge-Konflikte entstehen erst beim Merge und muessen manuell geloest werden
- Kein Ueberblick: Welche Sessions laufen, was aendern sie, wo gibt es Overlap?

**Solution:**
- Two-Phase Claims: Pre-Scan (predicted, aus Spec-Deliverables) VOR Implementation + Post-Scan (actual, aus git diff) NACH Implementation
- Worktree-Isolation: Orchestrator prueft/erstellt Worktree in Phase 0, implementiert isoliert
- Conflict-Scanner Sub-Agent (LLM): Liest Specs/Diffs nativ, ruft gh CLI via Bash auf, schreibt JSON-Dateien. Wird in zwei Varianten aufgerufen: Pre-Scan (predicted Claims aus Spec) und Post-Scan (actual Claims aus git diff)
- Conflict-Reporter Sub-Agent (LLM): Wird NUR bei Overlap aufgerufen (~2% der Faelle). Liest overlap-report.json, schreibt menschenlesbaren Issue-Comment mit Kontext und Empfehlung
- GitHub-basierte Session-Registry: Issues als Remote State (Cross-Machine, PM-sichtbar)

**Zwei-Agent-Architektur:**

| Komponente | Typ | Verantwortung | Aufgerufen |
|------------|-----|--------------|------------|
| `conflict-scanner` (Pre-Scan) | Sub-Agent (Task()) | Spec-Deliverables lesen, File-Level Claims extrahieren, predicted-claims.json + GitHub Issue erstellen, Pre-Overlap pruefen | Phase 0 (vor Implementation) |
| `conflict-scanner` (Post-Scan) | Sub-Agent (Task()) | git diff ausfuehren + parsen, Entity-Level Claims extrahieren, claims.json + overlap-report.json schreiben, GitHub Issue updaten, Overlap berechnen | Phase 4b (nach Implementation) |
| `conflict-reporter` | Sub-Agent (Task()) | overlap-report.json lesen, Kontext verstehen, Issue-Comment schreiben, gh issue comment | Nur bei Overlap (~2%) |

**Design-Prinzipien:**
- Sub-Agents fuer alle Scans: LLM liest Markdown/Diffs nativ (kein Regex), ruft CLI-Tools via Bash auf, schreibt JSON via Write — zero eigener Code
- Two-Phase Claims: Predicted Claims (aus Spec) VOR Implementation als Fruehwarnung, Actual Claims (aus git diff) NACH Implementation als Wahrheit
- Worktree-First: Neuer Worktree brancht von latest main (implizit rebased). Existierender Worktree wird rebaset. Agent prueft automatisch via `git worktree list`
- Advisory statt Blocking: Pre-Scan warnt bei Overlap, blockiert NICHT (verhindert Deadlocks bei abandoned Sessions)
- Fresh Context Pattern: Jeder Agent-Aufruf bekommt frischen Context ohne Orchestrator-Bias
- Plugin-Packaging: Agent-Definitionen im cc-agents Marketplace-Plugin (kein Script-Code)

**Business Value:**
- Pipeline laeuft autonom durch, auch bei paralleler Entwicklung
- Entity-Level Sichtbarkeit: PM/Dev sieht welche Funktionen/Klassen in Konflikt stehen
- Multi-Dev-Faehigkeit ab Tag 1 (GitHub Issues als Remote State)
- Zero extra Infrastruktur (Git + GitHub CLI)

---

## Scope & Boundaries

| In Scope |
|----------|
| Worktree Setup (Phase 0): Orchestrator prueft ob Worktree existiert → erstellt neuen (brancht von main) oder rebaset existierenden |
| `git rerere` Aktivierung fuer wiederkehrende Conflict-Patterns |
| GitHub Session-Registry: Issue pro Pipeline-Run mit Two-Phase Claims (predicted → actual) |
| Conflict-Scanner Sub-Agent: Zwei Aufrufe — Pre-Scan (File-Level Claims aus Spec) und Post-Scan (Entity-Level Claims aus git diff) |
| Pre-Scan (Phase 0): Predicted Claims aus Spec-Deliverables, File-Level Overlap, Advisory Warning |
| Post-Scan (Phase 4b): Actual Claims aus git diff, Entity-Level Overlap, Reporter bei Overlap |
| Conflict-Reporter Sub-Agent: Menschenlesbare Issue-Comments mit Kontext und Empfehlung (nur bei Post-Scan Overlap) |
| Orchestrator Integration: Phase 0 (Worktree Setup + Pre-Scan) + Phase 4b (Post-Scan + Reporter) |
| Plugin-Packaging: Agent-Definitionen in `plugins/clemens/agents/` (kein scripts/ Verzeichnis noetig) |

| Out of Scope |
|--------------|
| LLM-basierte Konfliktloesung (Rizzler / gleiche Entity verschiedene Aenderungen) |
| Inline Conflict-Checks waehrend Implementation (vor/nach jedem Slice) |
| Architecture-Integration (Fruehwarnung nach Gate 1) |
| Merge Queue Automatisierung (manueller Merge im MVP) |
| Dependency-Aware Merge-Reihenfolge |
| Dashboard / Echtzeit-Monitoring |
| Slack/Email Notifications (nur GitHub @mention) |

---

## Current State Reference

> Existing functionality that will be reused (unchanged).

- Orchestrator: Wave-based Implementation mit 6-Step Pipeline
- Orchestrator State: `.orchestrator-state.json` im Spec-Pfad
- Sub-Agent Pattern: Orchestrator nutzt `Task()` fuer Sub-Agents mit JSON-Parsing
- Claude Code Worktree-Support: `claude --worktree` und `isolation: worktree` fuer Sub-Agents
- Plugin-System: `plugins/clemens/` mit agents/, commands/, templates/

---

## Architecture

### Conflict-Resolution Ebenen

| Ebene | Mechanismus | Loest | MVP |
|-------|-------------|-------|-----|
| 1: Vermeidung | Worktrees + Task-Dekomposition | ~90% (kein File-Overlap) | Ja |
| 2: Erkennung + Eskalation | Conflict-Scanner + Reporter Sub-Agents + GitHub Issues | ~10% (File/Entity Overlap, menschliche Entscheidung noetig) | Ja |

Entity-Extraktion: `git diff main...HEAD` — Sub-Agent liest diff Output nativ und extrahiert Entity-Namen aus `@@` Hunk-Headers.

### Pipeline-Flow (Two-Phase Claims)

```
0. Phase 0: Worktree Setup + Pre-Scan (VOR Implementation)
   ┌──────────────────────────────────────────────────────────┐
   │  Step 0a: Worktree Setup                                 │
   │  → git worktree list pruefen                             │
   │  → IF worktree fuer Feature existiert:                   │
   │       cd worktrees/{feature}                             │
   │       git rebase main (catch up mit latest main)         │
   │  → ELSE:                                                 │
   │       git worktree add worktrees/{feature}               │
   │         -b feature/{feature}                             │
   │       (brancht von latest main → implizit rebased)       │
   │                                                          │
   │  Step 0b: Pre-Scan (Predicted Claims)                    │
   │  Task(conflict-scanner):                                 │
   │    mode: "predict"                                       │
   │    spec_path: specs/{spec}/                              │
   │    repo: owner/repo                                      │
   │                                                          │
   │  a) Read: slim-slices.md + slices/*.md                   │
   │     → Deliverables extrahieren (File-Level Claims)       │
   │  b) Write: predicted-claims.json                         │
   │  c) Bash: gh issue create --label "pipeline:running"     │
   │     → Body: predicted claims (File-Level)                │
   │  d) Bash: gh issue list --label "pipeline:running"       │
   │     → Andere Sessions holen                              │
   │     → Claims aus Issue-Body lesen (JSON)                 │
   │  e) File-Level Overlap berechnen                         │
   │  f) Return: { has_overlap, issue_number, overlaps[] }    │
   │                                                          │
   │  Bei Overlap: WARNING ausgeben (nicht blockieren)         │
   │  → "⚠️ Session #47 arbeitet an gleichen Dateien"         │
   │  → Dev entscheidet: weiter oder warten                   │
   └──────────────────────────────────────────────────────────┘

1. Orchestrator implementiert alle Slices im Worktree

2. Pipeline fertig (nach Final Validation) → Phase 4b: Conflict Scan (UPDATE)

   Step 1: Task() — Conflict-Scanner Sub-Agent (IMMER)
   ┌──────────────────────────────────────────────────────────┐
   │  Task(conflict-scanner):                                 │
   │    mode: "actual"                                        │
   │    branch: feature/{name}                                │
   │    spec_path: specs/{spec}/                              │
   │    repo: owner/repo                                      │
   │    issue_number: {N} (aus Phase 0)                       │
   │                                                          │
   │  a) Bash: git diff main...{branch}                      │
   │     → Entity-Level Changes aus Hunk Headers lesen        │
   │  b) Write: claims.json (actual, Entity-Level)            │
   │  c) Bash: gh issue edit → Body UPDATE mit actual Claims  │
   │     (ersetzt predicted claims durch echte Claims)        │
   │  d) Bash: gh issue list --label "pipeline:running"       │
   │     → Andere Sessions holen                              │
   │     → Claims aus Issue-Body lesen (JSON)                 │
   │  e) Entity-Overlap berechnen (File + Entity Match)       │
   │  f) Write: overlap-report.json                           │
   │  g) Return: { has_overlap, overlaps[], summary }         │
   └──────────────────────────────────────────────────────────┘

   Step 2: Task() — Reporter Sub-Agent (NUR bei has_overlap=true)
   ┌──────────────────────────────────────────────────────────┐
   │  Task(conflict-reporter):                                │
   │                                                          │
   │  Input: overlap-report.json Pfad                         │
   │  a) Read: overlap-report.json                            │
   │  b) Kontext verstehen, Empfehlung formulieren            │
   │  c) Issue-Comment schreiben (menschenlesbar)             │
   │  d) Bash: gh issue comment {own_issue} --body "..."      │
   │  e) Bash: gh issue comment {their_issue} --body "..."    │
   │  f) Return: { commented: true, issues: [47, 52] }       │
   └──────────────────────────────────────────────────────────┘

   Step 3: Bash — Label setzen (IMMER)
   → gh issue edit {issue} --remove-label "pipeline:running" --add-label "pipeline:merge-ready"

3. Manueller Merge (Dev entscheidet Reihenfolge)
   → git merge feature/{name}
   → Tests laufen
   → git push
   → Label → "pipeline:merged"
```

### GitHub Issue Schema

**Ein Issue pro Pipeline-Run:**

Title: `Pipeline: {feature-name}`
Labels: `pipeline:running` | `pipeline:merge-ready` | `pipeline:merged` | `pipeline:merge-failed`
Assignee: Dev der die Pipeline gestartet hat

Body (JSON-Block fuer maschinelles Parsing + menschliche Lesbarkeit):

```markdown
## Session

\`\`\`json
{
  "session_id": "abc-123-def",
  "feature": "workspace-redesign",
  "branch": "feature/workspace-redesign",
  "spec_path": "specs/2026-03-09-workspace-redesign/",
  "started_at": "2026-03-09T14:00:00Z"
}
\`\`\`

## Entity Claims

\`\`\`json
{
  "entities_changed": [
    {
      "file": "components/workspace/prompt-area.tsx",
      "entity": "PromptArea",
      "entity_type": "function",
      "lines": [42, 68],
      "diff_summary": "+9 -3"
    },
    {
      "file": "components/workspace/prompt-area.tsx",
      "entity": "usePromptState",
      "entity_type": "function",
      "lines": [12, 28],
      "diff_summary": "+4 -1"
    },
    {
      "file": "lib/aspect-ratio.ts",
      "entity": null,
      "entity_type": "new_file",
      "lines": [1, 45],
      "diff_summary": "+45 -0"
    }
  ],
  "summary": {
    "files_changed": 12,
    "entities_changed": 18,
    "new_files": 3
  }
}
\`\`\`
```

### overlap-report.json Schema

```json
{
  "session_id": "abc-123-def",
  "feature": "workspace-redesign",
  "branch": "feature/workspace-redesign",
  "scan_timestamp": "2026-03-09T14:30:00Z",
  "entities_changed": [
    {
      "file": "components/workspace/prompt-area.tsx",
      "entity": "PromptArea",
      "entity_type": "function",
      "lines": [42, 68],
      "diff_summary": "+9 -3"
    }
  ],
  "overlaps": [
    {
      "file": "components/workspace/prompt-area.tsx",
      "our_entity": "PromptArea",
      "their_entity": "PromptArea",
      "their_issue": 47,
      "their_feature": "prompt-shortcuts",
      "their_user": "clemens",
      "overlap_type": "same_entity",
      "severity": "high"
    },
    {
      "file": "components/workspace/prompt-area.tsx",
      "our_entity": "usePromptState",
      "their_entity": "handleSubmit",
      "their_issue": 47,
      "their_feature": "prompt-shortcuts",
      "their_user": "clemens",
      "overlap_type": "same_file_different_entity",
      "severity": "low"
    }
  ],
  "summary": {
    "files_changed": 12,
    "entities_changed": 18,
    "overlapping_files": 1,
    "overlapping_entities": 1,
    "max_severity": "high"
  }
}
```

### Severity-Regeln (deterministisch)

| Overlap | Severity | Bedeutung | Aktion |
|---------|----------|-----------|--------|
| Kein File-Overlap | `none` | Unabhaengige Aenderungen | Auto-Merge |
| Gleiche Datei, verschiedene Entities | `low` | Wahrscheinlich konfliktfrei | Info im Issue |
| Gleiche Datei, gleiche Entity | `high` | Manueller Review noetig | Warning + Empfehlung im Issue |

### LLM-Reporter Issue-Comment Format

```markdown
### Conflict Scan: workspace-redesign

**1 Entity-Overlap (severity: high)**

| Datei | Entity | Diese Session | Konflikt mit | Andere Session |
|-------|--------|--------------|-------------|----------------|
| `prompt-area.tsx` | `PromptArea()` | +9 -3 | #47 prompt-shortcuts (@clemens) | +4 -1 |

**Kontext:** Beide Sessions aendern `PromptArea()`.
- Diese Session: Layout/Rendering refactored
- #47: Keyboard-Shortcut-Logik hinzugefuegt

**Empfehlung:** Manueller Review empfohlen.
→ Erst #47 mergen, dann diese Session rebasen.

**Low severity (wahrscheinlich konfliktfrei):**
- `prompt-area.tsx`: `usePromptState` (ours) + `handleSubmit` (theirs) → verschiedene Entities, git merge loest
```

---

## Business Rules

**Two-Phase Claims:**
- Phase 0 (Pre-Scan): Predicted Claims aus Slice-Spec-Deliverables (File-Level) VOR Implementation
- Phase 4b (Post-Scan): Actual Claims aus git diff (Entity-Level) NACH Implementation
- Issue wird in Phase 0 ERSTELLT (predicted claims) und in Phase 4b AKTUALISIERT (actual claims)
- Pre-Scan ist ADVISORY: Warnung bei Overlap, KEIN Blocking (verhindert Deadlocks bei abandoned Sessions)
- Post-Scan ist die Wahrheit: Actual Claims ersetzen predicted Claims im Issue-Body

**Worktree & Rebase:**
- Vor jeder Implementation MUSS ein Worktree existieren oder erstellt werden (Phase 0, Step 0a)
- Neuer Worktree brancht von latest main → implizit auf aktuellem Stand
- Existierender Worktree wird rebaset auf latest main (catch up)
- Agent prueft automatisch via `git worktree list`

**Claims & Overlap:**
- Predicted Claims kommen aus Slice-Spec Deliverables (Dateipfade aus slim-slices.md / slices/*.md)
- Actual Claims werden aus git diff Hunk Headers extrahiert (Agent liest nativ)
- Entity-Level Granularitaet nur bei Actual Claims (Funktionen, Klassen, Methoden via Hunk Headers)
- Predicted Claims sind File-Level (weniger granular, aber frueh verfuegbar)

**Scans:**
- Conflict-Scan ist non-blocking: Label wird "merge-ready" auch bei Overlap
- Scanner-Agent laeuft IMMER (Pre + Post). Reporter-Agent laeuft NUR bei Post-Scan Overlap (~2%)
- Overlap-Comments werden in beide betroffenen Issues geschrieben (mit @mention)
- Reporter schreibt Comments, entscheidet nicht — Overlap-Daten aus Scanner-Agent sind Grundlage
- Severity "low" = Info (wahrscheinlich konfliktfrei), Severity "high" = Warnung (manueller Review)

**Allgemein:**
- Merge ist manuell im MVP (Dev entscheidet Reihenfolge)
- GitHub `gh` CLI muss installiert sein (Voraussetzung)
- Ein Issue pro Pipeline-Run, nicht pro Slice oder pro Dev
- Scanner-Agent gibt strukturiertes JSON zurueck (has_overlap, overlaps[], issue_number)

---

## Data

### claims.json (eigene Entity-Claims)

| Field | Required | Validation | Notes |
|-------|----------|------------|-------|
| `entities_changed[]` | Yes | Non-empty array | Aus git diff Hunk Headers (Agent liest nativ) |
| `entities_changed[].file` | Yes | Valid relative path | Relativer Pfad |
| `entities_changed[].entity` | Yes | String or null | Entity-Name, null fuer neue Dateien |
| `entities_changed[].entity_type` | Yes | `function`/`class`/`method`/`new_file`/`unknown` | Aus Hunk-Header heuristisch |
| `entities_changed[].lines` | Yes | [start, end] | Zeilen-Range |
| `entities_changed[].diff_summary` | Yes | String | z.B. "+9 -3" |
| `summary.files_changed` | Yes | Integer | Anzahl geaenderter Dateien |
| `summary.entities_changed` | Yes | Integer | Anzahl geaenderter Entities |
| `summary.new_files` | Yes | Integer | Anzahl neuer Dateien |

### overlap-report.json

| Field | Required | Validation | Notes |
|-------|----------|------------|-------|
| `session_id` | Yes | UUID | Eigene Session-ID |
| `feature` | Yes | String | Feature-Name |
| `scan_timestamp` | Yes | ISO 8601 | Zeitpunkt des Scans |
| `entities_changed[]` | Yes | Array | Eigene Claims (Kopie) |
| `overlaps[]` | Yes | Array | Gefundene Overlaps |
| `overlaps[].file` | Yes | String | Betroffene Datei |
| `overlaps[].our_entity` | Yes | String | Unsere Entity |
| `overlaps[].their_entity` | Yes | String | Deren Entity |
| `overlaps[].their_issue` | Yes | Integer | GitHub Issue-Nummer |
| `overlaps[].their_feature` | Yes | String | Feature-Name |
| `overlaps[].their_user` | Yes | String | GitHub-Username |
| `overlaps[].overlap_type` | Yes | `same_entity`/`same_file_different_entity` | Art des Overlaps |
| `overlaps[].severity` | Yes | `low`/`high` | Schweregrad |
| `summary.max_severity` | Yes | `none`/`low`/`high` | Hoechster Schweregrad |

---

## Trigger Inventory

| Trigger | Source | Action | Result |
|---------|--------|--------|--------|
| Pipeline startet (Phase 0) | Orchestrator Phase 0 | `Task(conflict-scanner, mode=predict)` | predicted-claims.json + Issue erstellt + Advisory Warning |
| Final Validation bestanden | Orchestrator Phase 4b Step 1 | `Task(conflict-scanner, mode=actual)` | claims.json + overlap-report.json + Issue aktualisiert |
| Overlap gefunden (Post-Scan) | Scanner-Agent Output (has_overlap=true) | `Task(conflict-reporter)` | Menschenlesbare Issue-Comments in beiden Issues |
| Kein Overlap (Post-Scan) | Scanner-Agent Output (has_overlap=false) | Kein Reporter-Agent | Nur Issue + Label |
| Phase 4b abgeschlossen | Orchestrator Step 3 | `Bash: gh issue edit --add-label` | Label → "pipeline:merge-ready" |
| Dev merged manuell | git merge | Tests + Push | Label → merged/merge-failed |

---

## Implementation Slices

### Dependencies

```
Slice 1 (Conflict-Scanner) ────┐
                                ├──> Slice 3 (Orchestrator Integration)
Slice 2 (Conflict-Reporter) ───┘
```

### Slices

| # | Name | Scope | Testability | Dependencies |
|---|------|-------|-------------|--------------|
| 1 | Conflict-Scanner Sub-Agent | `plugins/clemens/agents/conflict-scanner.md`: Agent-Definition mit Tools (Read, Glob, Grep, Bash, Write). Zwei Aufruf-Varianten: Pre-Scan (liest Spec-Deliverables, erstellt predicted-claims.json + GitHub Issue, berechnet File-Level Overlap) und Post-Scan (fuehrt git diff aus, extrahiert Entities aus Hunk Headers, erstellt claims.json + overlap-report.json, aktualisiert GitHub Issue, berechnet Entity-Level Overlap). JSON-Output-Contract fuer Orchestrator. | Test: Agent mit Mock-Spec → korrekte File-Claims; Agent mit echtem Repo → korrekte Entity-Claims; Overlap-Berechnung korrekt | -- |
| 2 | Conflict-Reporter Sub-Agent | `plugins/clemens/agents/conflict-reporter.md`: Agent-Definition mit Tools (Read, Bash). Liest overlap-report.json, generiert menschenlesbaren Issue-Comment mit Kontext + Empfehlung, postet via `gh issue comment` in beide Issues mit @mention | Test: Mock overlap-report.json → korrekter Comment-Text, Comment in beiden Issues | -- |
| 3 | Orchestrator Integration | Phase 0 (Worktree Setup + Pre-Scan): Step 0a: Worktree erstellen/rebasen, Step 0b: Task(conflict-scanner, mode=predict), Advisory-Warning bei Overlap. Phase 4b (Post-Scan): Step 1: Task(conflict-scanner, mode=actual), Step 2: Wenn has_overlap → Task(conflict-reporter), Step 3: Bash(`gh issue edit --add-label`). git rerere aktivieren. JSON-Parsing fuer Scanner/Reporter-Output. | Test: Orchestrator erstellt Worktree, fuehrt Pre-Scan durch, warnt bei Overlap, implementiert, fuehrt Post-Scan durch, ruft Reporter nur bei Post-Scan Overlap, setzt Label | Slice 1, 2 |

### Recommended Order

1. **Slice 1:** Conflict-Scanner Agent — Kern-Agent fuer Pre-Scan + Post-Scan
2. **Slice 2:** Conflict-Reporter Agent — Agent-Definition, unabhaengig testbar mit Mock-Daten
3. **Slice 3:** Orchestrator Integration — Verbindet Phase 0 + Phase 4b + Worktree + rerere + beide Agents mit der Pipeline

---

## Prerequisites

| Prerequisite | Installation | Einmalig? |
|-------------|-------------|-----------|
| GitHub CLI | `gh auth login` | Ja, pro Rechner |
| Git | Bereits vorhanden | -- |
| Repo: git rerere | `git config rerere.enabled true` | Ja, pro Repo |

---

## Context & Research

### Tool-Stack

| Tool | Rolle | Warum |
|------|-------|-------|
| GitHub Issues | Session-Registry + Claims + Notifications | Remote State, Cross-Machine, PM-sichtbar, `gh` CLI |
| Sub-Agent (conflict-scanner) | Pre-Scan + Post-Scan: Claims extrahieren, Issues verwalten, Overlap berechnen | LLM liest Markdown/Diffs nativ, kein Regex-Code noetig |
| Sub-Agent (conflict-reporter) | Menschenlesbare Issue-Comments | Kontext + Empfehlung die ein Template nicht liefern kann |

### Tool-Evaluation

| Tool-Kategorie | Evaluiert | Ergebnis |
|----------------|-----------|----------|
| Graphite (Stacked PRs) | Ja | Branch-Management, nicht Entity-Level Analysis |
| GitButler (Virtual Branches) | Ja | Parallele Branches, nicht Session-Tracking |
| Mergify / GitHub Merge Queue | Ja | Queue/CI-Gates, nicht semantische Analyse |
| Weave MCP CRDT State | Ja | Lokal — nicht Cross-Machine ohne Sync |
| Weave MCP Tools | Ja | 15 Tools, aber nur aus Agent-Context nutzbar. V2-Kandidat |
| **GitHub Issues + Sub-Agents** | Ja | **Gewaehlt: Sub-Agents fuer alle Scans + GitHub als Remote State. Kein eigener Script-Code.** |

### Plugin-Packaging

```
plugins/clemens/
├── .claude-plugin/
│   └── plugin.json
├── agents/
│   ├── conflict-scanner.md     ← NEU (Slice 2)
│   ├── conflict-reporter.md    ← NEU (Slice 3)
│   └── ... (bestehende Agents)
├── commands/         (bestehend)
└── templates/        (bestehend)
```

---

## Research Log

| Date | Area | Finding |
|------|------|---------|
| 2026-03-07 | Web | Gas Town: Hierarchische Agents, Git-backed JSONL State, Refinery-Agent |
| 2026-03-07 | Web | Weave: Entity-Level Merge, 100% Benchmark, Tree-Sitter basiert |
| 2026-03-07 | Web | Claude Code Agent Teams: Shared Task List, File Locking, Mailbox-System |
| 2026-03-07 | Web | Merge Queue Patterns: GitHub native, Graphite, Aviator |
| 2026-03-07 | Codebase | 3 parallele Features mit ueberlappenden Dateien (prompt-area.tsx in allen 3) |
| 2026-03-09 | Analyse | Vorschlag evaluiert: Graphite/GitButler/Mergify loesen Teile, Entity-Level Overlap muss selbst gebaut werden |
| 2026-03-09 | Analyse | REVIDIERT: Sub-Agent statt Script. Parsing (Markdown, git diff) ist der schwierige Teil — LLM macht das nativ. Overlap-Vergleich (String-Match) ist trivial fuer LLM. ~400 LOC Script-Code mit Regex-Bugs nicht gerechtfertigt bei ~$0.05/Run Agent-Kosten. |
| 2026-03-09 | Analyse | Git Hunk Headers liefern Entity-Namen (Fallback wenn Weave nicht verfuegbar) |
| 2026-03-09 | Web | Weave MCP Server: 15 Tools, Entity Claiming, CRDT State, Advisory Locks |
| 2026-03-09 | Web | Weave CRDT: `.weave/state.automerge`, Automerge-basiert, lokal (nicht remote) |
| 2026-03-09 | Analyse | Architektur-Entscheidung: Weave CLI fuer Entity-Analyse + GitHub Issues fuer Remote State |
| 2026-03-09 | Analyse | Weave Claiming/CRDT/MCP nicht genutzt (lokal), stattdessen GitHub Issues als Cross-Machine State |
| 2026-03-09 | Analyse | Sub-Agent vs Orchestrator-inline: Sub-Agent mit frischem Context zuverlaessiger |
| 2026-03-09 | Analyse | Script (deterministisch, immer) + Sub-Agent (LLM, nur bei Overlap ~2%) = kosteneffizient |
| 2026-03-09 | Analyse | Weave CLI statt MCP: CLI aus Scripts aufrufbar, MCP nur aus Agent-Context |

---

## Q&A Log

| # | Frage | Antwort |
|---|-------|---------|
| 1 | SOTA Agent Pipelines recherchieren? | Ja, ausfuehrliche Recherche (Gas Town, Claude Code Teams, Weave, etc.) |
| 2 | Primaeres Szenario fuer Parallelitaet? | Beides: Solo-Dev Multi-Session UND Multi-Dev |
| 3 | Backend fuer External State? | GitHub API: Issues/Labels/Comments |
| 4 | Welche Ebenen im MVP? | 2: Vermeidung (Worktrees) + Erkennung/Eskalation (Sub-Agents + GitHub Issues). Weave entfaellt — git diff Hunk Headers reichen fuer Entity-Extraktion. |
| 5 | Agent oder Script? | Sub-Agent: LLM liest Markdown/Diffs nativ (kein Regex), ruft CLI via Bash auf. Script haette ~400 LOC eigenen Code mit fragilen Regex-Parsern fuer Markdown und Hunk Headers. Agent-Kosten (~$0.05-0.10/Run) vernachlaessigbar vs. Wartungskosten. |
| 6 | File-Level oder Entity-Level Claims? | Entity-Level via git diff Hunk Headers (Agent liest nativ). File-Level fuer Pre-Scan (aus Spec-Deliverables). |
| 7 | Wann Claims schreiben? | Two-Phase: Predicted Claims VOR Implementation (Phase 0), Actual Claims NACH Implementation (Phase 4b). |
| 8 | Content-Level Claims Format? | JSON mit Entity + Kontext, LLM-Reporter fuer Issue-Comments |
| 9 | Plugin-Packaging moeglich? | Ja, agents/ Verzeichnis im Plugin. Kein scripts/ noetig — Agents statt Scripts |
| 10 | Vorschlag evaluiert? | Bestaetigt Richtung, kennt aber Weave nicht. Discovery ist weiter |
| 11 | 5 Schichten noetig? | Nein, 3 reichen |
| 12 | Weave MCP CRDT als State nutzen? | Nein. GitHub Issues als Remote State. Weave komplett entfallen — git diff + Sub-Agent reichen. |
| 13 | Merge Queue automatisieren? | Nein, manueller Merge im MVP. Dev entscheidet Reihenfolge |
| 14 | Phase 4b: Sub-Agent oder Orchestrator-inline? | Sub-Agent (frischer Context zuverlaessiger als Orchestrator nach langem Run) |
| 15 | Was macht der Reporter Sub-Agent? | NUR Issue-Comment schreiben. Scanner-Agent macht Claims + Overlap. |
| 16 | Reporter immer oder nur bei Overlap? | Nur bei Post-Scan Overlap (~2%). Scanner-Agent laeuft immer (Pre + Post). |
| 17 | Weave noetig? | Nein. git diff Hunk Headers reichen fuer Entity-Extraktion. LLM liest Diffs nativ. Weave waere zusaetzliche Dependency (Rust/Cargo) ohne signifikanten Mehrwert. |
| 18 | Pre-Scan blocking oder advisory? | Advisory: Pre-Scan warnt bei Overlap, blockiert nicht. Verhindert Deadlocks bei abandoned Sessions. Dev entscheidet ob er wartet oder fortfaehrt. |
| 19 | Wann Claims schreiben: vor oder nach Implementation? | Beides (Two-Phase): Predicted Claims aus Spec VOR Implementation (File-Level, Fruehwarnung), Actual Claims aus git diff NACH Implementation (Entity-Level, Wahrheit). Issue wird in Phase 0 erstellt und in Phase 4b aktualisiert. |
| 20 | Warum nicht nur Pre-Scan? | Predicted Claims aus Spec sind unvollstaendig: Implementation kann Dateien aendern die nicht im Plan stehen (Dependency-Discovery). Post-Scan mit actual diff ist die Wahrheit. |
| 21 | Warum nicht nur Post-Scan? | Post-Scan erkennt Overlap erst NACH der kompletten Implementation. Verschwendete Compute-Zeit wenn Overlap schon aus dem Plan erkennbar war. Pre-Scan als Fruehwarnung spart Resourcen. |
| 22 | Warum Sub-Agent statt Script? | Script braeuchte ~400 LOC mit Regex-Parsern fuer Markdown (Deliverables) und git diff (Hunk Headers). Beides sind unstrukturierte Texte — LLM liest diese nativ. Overlap-Vergleich ist trivial (String-Match). Bisherige Script-Bugs (ENOBUFS, base-branch detection) bestaetigen Wartungsaufwand. Agent-Kosten (~$0.05-0.10/Run) sind vernachlaessigbar. |
