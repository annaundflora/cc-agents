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
- Worktree-Isolation: Jeder Orchestrator laeuft auf eigenem Branch/Worktree
- Weave als Git merge driver: Entity-Level Merge loest ~98% der Konflikte automatisch
- Deterministisches Conflict-Scanner Script (Node.js): Nutzt `weave-cli` fuer Entity-Analyse, erstellt GitHub Issue mit Claims, berechnet Overlap mit anderen Sessions, schreibt overlap-report.json
- Conflict-Reporter Sub-Agent (LLM): Wird NUR bei Overlap aufgerufen (~2% der Faelle). Liest overlap-report.json, schreibt menschenlesbaren Issue-Comment mit Kontext und Empfehlung
- GitHub-basierte Session-Registry: Issues als Remote State (Cross-Machine, PM-sichtbar)

**Zwei-Komponenten-Architektur:**

| Komponente | Typ | Verantwortung | Deterministisch? | Aufgerufen |
|------------|-----|--------------|------------------|------------|
| `conflict-scanner.js` | Node.js Script | Entity-Analyse (Weave CLI), GitHub Issue erstellen, Claims schreiben, Overlap berechnen, overlap-report.json | Ja (100%) | Immer (Phase 4b) |
| `conflict-reporter` | Sub-Agent (Task()) | overlap-report.json lesen, Kontext verstehen, Issue-Comment schreiben, gh issue comment | Nein (LLM) | Nur bei Overlap (~2%) |

**Design-Prinzipien:**
- Maximal deterministisch: Script macht alle Berechnungen, Agent nur fuer menschenlesbare Comments
- Sub-Agent statt Orchestrator-inline: Frischer Context ist zuverlaessiger als Orchestrator nach langem Run
- Cross-Platform: Node.js Script laeuft auf Windows, Mac, Linux
- Stack-agnostisch: Weave unterstuetzt 16+ Sprachen via Tree-sitter
- Plugin-Packaging: Script + Agent-Definition im cc-agents Marketplace-Plugin
- Ein Scan-Zeitpunkt: Nach Implementation, vor Merge
- Kosten-effizient: In 98% der Faelle nur Script (0 API-Kosten), Agent nur bei Overlap (~$0.10)

**Business Value:**
- Pipeline laeuft autonom durch, auch bei paralleler Entwicklung
- Entity-Level Sichtbarkeit: PM/Dev sieht welche Funktionen/Klassen in Konflikt stehen
- Multi-Dev-Faehigkeit ab Tag 1 (GitHub Issues als Remote State)
- Zero extra Infrastruktur (Weave + GitHub API + Node.js)

---

## Scope & Boundaries

| In Scope |
|----------|
| Worktree-Isolation: Orchestrator erstellt automatisch Worktree + Branch bei Start |
| Weave Setup: Merge Driver + `.gitattributes` Config fuer Ziel-Repos |
| `git rerere` Aktivierung fuer wiederkehrende Conflict-Patterns |
| GitHub Session-Registry: Issue pro Pipeline-Run mit Entity-Level Claims (JSON) |
| Conflict-Scanner Script (`conflict-scanner.js`): Weave CLI + gh CLI → claims.json + overlap-report.json |
| Conflict-Reporter Sub-Agent: Menschenlesbare Issue-Comments mit Kontext und Empfehlung (nur bei Overlap) |
| Orchestrator Integration: Phase 4b — Script via Bash, Agent via Task() bei Overlap |
| Plugin-Packaging: Script in `plugins/clemens/scripts/`, Agent in `plugins/clemens/agents/` |

| Out of Scope |
|--------------|
| LLM-basierte Konfliktloesung (Rizzler / gleiche Entity verschiedene Aenderungen) |
| Inline Conflict-Checks waehrend Implementation (vor/nach jedem Slice) |
| Architecture-Integration (Fruehwarnung nach Gate 1) |
| Weave CRDT State Sync (Multi-Machine ueber `.weave/state.automerge`) |
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
- Plugin-System: `plugins/clemens/` mit agents/, commands/, templates/, scripts/

---

## Architecture

### Conflict-Resolution Ebenen

| Ebene | Mechanismus | Loest | MVP |
|-------|-------------|-------|-----|
| 1: Vermeidung | Worktrees + Task-Dekomposition | ~90% (kein File-Overlap) | Ja |
| 2: Semantic Merge | Weave als Git merge driver | ~8% (verschiedene Entities in gleicher Datei) | Ja |
| 3: Erkennung + Eskalation | Conflict-Scanner Script + Reporter Sub-Agent + GitHub Issues | ~2% (gleiche Entity, menschliche Entscheidung noetig) | Ja |

### Weave CLI — genutzte Befehle

Das Script nutzt `weave-cli` (CLI), nicht Weave MCP (Agent-only). CLI ist aus Scripts aufrufbar.

| Befehl | Was es tut | Aufgerufen von |
|--------|-----------|----------------|
| `weave-cli setup` | `.gitattributes` + git config erstellen | Einmalig pro Repo (Slice 1) |
| `weave-cli preview {branch}` | Dry-Run Merge mit Entity-Level Analyse | Script: Entity-Extraktion + Merge-Validation |

Fallback wenn Weave nicht installiert: `git diff main...HEAD` mit Hunk-Header-Parsing (Entity-Namen aus `@@`-Zeilen).

### Pipeline-Flow

```
1. Pipeline startet
   → git worktree add worktrees/{feature} -b feature/{feature}
   → Orchestrator implementiert alle Slices (unveraendert)

2. Pipeline fertig (nach Final Validation) → Phase 4b: Conflict Scan

   Step 1: Bash — Deterministisches Script (IMMER)
   ┌──────────────────────────────────────────────────────────┐
   │  node conflict-scanner.js \                              │
   │    --branch feature/{name} \                             │
   │    --spec-path specs/{spec}/ \                           │
   │    --repo owner/repo                                     │
   │                                                          │
   │  a) weave-cli preview main → Entity-Level Changes        │
   │     (Fallback: git diff Hunk Headers)                    │
   │  b) claims.json schreiben                                │
   │  c) gh issue create --label "pipeline:running"            │
   │  d) gh issue list --label "pipeline:running"              │
   │     → Andere Sessions holen                              │
   │     → Claims aus Issue-Body parsen (JSON)                │
   │  e) Entity-Overlap berechnen (File + Entity Match)       │
   │  f) overlap-report.json schreiben                        │
   │  g) Exit-Code: 0 = kein Overlap, 1 = Overlap, 2 = Error │
   └──────────────────────────────────────────────────────────┘

   Step 2: Task() — Sub-Agent (NUR bei Exit-Code 1)
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
   → weave-cli preview feature/{name}   (optional: Vorschau)
   → git merge feature/{name}            (Weave loest Entity-Level)
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
  "weave_validation": {
    "auto_resolvable": true,
    "conflict_entities": ["PromptArea"],
    "confidence": "medium"
  },
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
| Gleiche Datei, verschiedene Entities | `low` | Weave loest automatisch | Info im Issue |
| Gleiche Datei, gleiche Entity | `high` | Weave kann nicht loesen | Warning + Empfehlung im Issue |

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
Weave kann gleiche Entity nicht automatisch mergen.
→ Erst #47 mergen, dann diese Session rebasen.

**Auto-Resolved (low severity):**
- `prompt-area.tsx`: `usePromptState` (ours) + `handleSubmit` (theirs) → Weave loest
```

---

## Business Rules

- Jede Pipeline-Session MUSS ein GitHub Issue erstellen (nach Final Validation)
- Claims werden aus `weave-cli preview` extrahiert (Fallback: git diff Hunk Headers)
- Entity-Level Granularitaet: Funktionen, Klassen, Methoden (via Tree-sitter, 16 Sprachen)
- Conflict-Scan ist non-blocking: Label wird "merge-ready" auch bei Overlap
- Script (deterministisch) laeuft IMMER. Sub-Agent (LLM) laeuft NUR bei Overlap (~2%)
- Overlap-Comments werden in beide betroffenen Issues geschrieben (mit @mention)
- Sub-Agent schreibt Comments, entscheidet nicht — deterministischer Overlap aus Script ist Grundlage
- Severity "low" = Info (Weave loest), Severity "high" = Warnung (manueller Review)
- Merge ist manuell im MVP (Dev entscheidet Reihenfolge)
- GitHub `gh` CLI + Weave CLI muessen installiert sein (Voraussetzung)
- Weave MCP Server ist NICHT noetig (Script nutzt CLI, nicht MCP)
- Ein Issue pro Pipeline-Run, nicht pro Slice oder pro Dev
- Script hat Exit-Code Semantik: 0 = kein Overlap, 1 = Overlap, 2 = Fehler

---

## Data

### claims.json (eigene Entity-Claims)

| Field | Required | Validation | Notes |
|-------|----------|------------|-------|
| `entities_changed[]` | Yes | Non-empty array | Aus Weave MCP `weave_diff` |
| `entities_changed[].file` | Yes | Valid relative path | Relativer Pfad |
| `entities_changed[].entity` | Yes | String or null | Entity-Name, null fuer neue Dateien |
| `entities_changed[].entity_type` | Yes | `function`/`class`/`method`/`new_file`/`unknown` | Aus Tree-sitter |
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
| `weave_validation` | Yes | Object | Aus `weave_validate_merge` |
| `summary.max_severity` | Yes | `none`/`low`/`high` | Hoechster Schweregrad |

---

## Trigger Inventory

| Trigger | Source | Action | Result |
|---------|--------|--------|--------|
| Final Validation bestanden | Orchestrator Phase 4b Step 1 | `Bash: node conflict-scanner.js` | claims.json + overlap-report.json + Issue erstellt |
| Overlap gefunden (Exit 1) | Script Exit-Code | `Task(conflict-reporter)` | Menschenlesbare Issue-Comments in beiden Issues |
| Kein Overlap (Exit 0) | Script Exit-Code | Kein Sub-Agent | Nur Issue + Label |
| Phase 4b abgeschlossen | Orchestrator Step 3 | `Bash: gh issue edit --add-label` | Label → "pipeline:merge-ready" |
| Dev merged manuell | git merge (Weave) | Tests + Push | Label → merged/merge-failed |

---

## Implementation Slices

### Dependencies

```
Slice 1 (Weave Setup) ─────────┐
                                ├──> Slice 4 (Orchestrator Integration)
Slice 2 (Conflict-Scanner) ────┤
                                │
Slice 3 (Conflict-Reporter) ───┘
```

### Slices

| # | Name | Scope | Testability | Dependencies |
|---|------|-------|-------------|--------------|
| 1 | Weave Setup | Weave CLI + Driver installieren, `.gitattributes` Template, `weave-cli setup` Anleitung, `git rerere` Config, Worktree-Erstellung im Orchestrator-Start | Test: Weave Config valide, Worktree erstellt, rerere aktiv | -- |
| 2 | Conflict-Scanner Script | `plugins/clemens/scripts/conflict-scanner.js`: `weave-cli preview` aufrufen (Fallback: git diff), Entity-Extraktion, claims.json generieren, `gh issue create` mit Claims-JSON, andere Issues lesen + Claims parsen, Entity-Overlap berechnen, overlap-report.json schreiben, Exit-Codes (0/1/2) | Test: Mock weave-cli Output → korrekte Claims, Mock gh → korrektes Issue, Overlap-Berechnung mit bekannten Claims, Exit-Codes korrekt | -- |
| 3 | Conflict-Reporter Sub-Agent | `plugins/clemens/agents/conflict-reporter.md`: Agent-Definition mit Tools (Read, Bash). Liest overlap-report.json, generiert menschenlesbaren Issue-Comment mit Kontext + Empfehlung, postet via `gh issue comment` in beide Issues mit @mention | Test: Mock overlap-report.json → korrekter Comment-Text, Comment in beiden Issues | -- |
| 4 | Orchestrator Integration | Phase 4b: Step 1: Bash(`node conflict-scanner.js`), Step 2: Wenn Exit 1 → Task(conflict-reporter), Step 3: Bash(`gh issue edit --add-label`). JSON-Parsing fuer Reporter-Output. | Test: Orchestrator ruft Script auf, prueft Exit-Code, ruft Agent nur bei Overlap, setzt Label | Slice 1, 2, 3 |

### Recommended Order

1. **Slice 1:** Weave Setup — Grundlage, reine Config + Installation
2. **Slice 2:** Conflict-Scanner Script — Kern-Deliverable, unabhaengig testbar
3. **Slice 3:** Conflict-Reporter Agent — Agent-Definition, unabhaengig testbar mit Mock-Daten
4. **Slice 4:** Orchestrator Integration — Verbindet Script + Agent mit der Pipeline

---

## Prerequisites

| Prerequisite | Installation | Einmalig? |
|-------------|-------------|-----------|
| Rust/Cargo | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` | Ja, pro Rechner |
| Weave CLI | `cargo install --git https://github.com/Ataraxy-Labs/weave weave-cli` | Ja, pro Rechner |
| Weave Driver | `cargo install --git https://github.com/Ataraxy-Labs/weave weave-driver` | Ja, pro Rechner |
| GitHub CLI | `gh auth login` | Ja, pro Rechner |
| Node.js | Bereits vorhanden (Claude Code Voraussetzung) | -- |
| Repo: Weave Setup | `weave-cli setup` (erstellt .gitattributes + git config) | Ja, pro Repo |
| Repo: git rerere | `git config rerere.enabled true` | Ja, pro Repo |

Nicht noetig: Weave MCP Server (`weave-mcp`). Script nutzt `weave-cli` (CLI), nicht MCP.

---

## Context & Research

### Tool-Stack

| Tool | Rolle | Warum |
|------|-------|-------|
| Weave (Merge Driver) | Entity-Level Merge bei `git merge`/`git rebase` | 100% Benchmark, Tree-sitter, zero Config nach Setup |
| Weave CLI (`weave-cli preview`) | Entity-Analyse fuer Conflict-Scanner Script | CLI statt MCP — aus Scripts aufrufbar, keine Agent-Dependency |
| GitHub Issues | Session-Registry + Claims + Notifications | Remote State, Cross-Machine, PM-sichtbar, `gh` CLI |
| Node.js Script | Deterministischer Kern: Weave CLI → GitHub → Overlap | Cross-Platform, keine Extra-Dependency |
| Sub-Agent (conflict-reporter) | Menschenlesbare Issue-Comments | Kontext + Empfehlung die ein Template nicht liefern kann |

### Tool-Evaluation

| Tool-Kategorie | Evaluiert | Ergebnis |
|----------------|-----------|----------|
| Graphite (Stacked PRs) | Ja | Branch-Management, nicht Entity-Level Analysis |
| GitButler (Virtual Branches) | Ja | Parallele Branches, nicht Session-Tracking |
| Mergify / GitHub Merge Queue | Ja | Queue/CI-Gates, nicht semantische Analyse |
| Weave MCP CRDT State | Ja | Lokal — nicht Cross-Machine ohne Sync |
| Weave MCP Tools | Ja | 15 Tools, aber nur aus Agent-Context nutzbar. V2-Kandidat |
| **Weave CLI + GitHub Issues** | Ja | **Gewaehlt: CLI aus Script aufrufbar + GitHub als Remote State** |

### Plugin-Packaging

```
plugins/clemens/
├── .claude-plugin/
│   └── plugin.json
├── agents/
│   ├── conflict-reporter.md    ← NEU (Slice 3)
│   └── ... (bestehende Agents)
├── commands/         (bestehend)
├── templates/        (bestehend)
└── scripts/
    └── conflict-scanner.js     ← NEU (Slice 2)
```

### Weave MCP Tools (Referenz — nicht im MVP genutzt)

Weave bietet 15 MCP Tools (Entity Claiming, CRDT State, Dependency Analysis). Im MVP nutzen wir stattdessen `weave-cli` (CLI) + GitHub Issues fuer Remote State. MCP Tools sind V2-Kandidaten:

| Tool | Funktion | V2-Relevanz |
|------|----------|-------------|
| `weave_claim_entity` / `weave_release_entity` | Advisory Locks | Hoch (Echtzeit-Koordination) |
| `weave_agent_register` / `weave_agent_heartbeat` | Session-Tracking | Hoch (wenn CRDT sync gelöst) |
| `weave_potential_conflicts` | Multi-Agent Overlap | Hoch (ersetzt Script-Overlap-Logik) |
| `weave_get_dependencies` / `weave_impact_analysis` | Blast-Radius | Mittel (tiefere Analyse) |

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
| 2026-03-09 | Analyse | Script statt Agent: Conflict-Detection ist deterministisch, braucht kein LLM |
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
| 4 | Welche Ebenen im MVP? | 3: Vermeidung (Worktrees) + Semantic Merge (Weave) + Erkennung (Script) |
| 5 | Agent oder Script? | Script: Deterministisch, keine API-Kosten, cross-platform |
| 6 | File-Level oder Entity-Level Claims? | Entity-Level via Weave MCP (Tree-sitter, 16 Sprachen) |
| 7 | Wann Claims schreiben? | Nach Implementation (aus Weave-Diff, 100% akkurat) |
| 8 | Content-Level Claims Format? | JSON mit Entity + Kontext, LLM-Reporter fuer Issue-Comments |
| 9 | Plugin-Packaging moeglich? | Ja, scripts/ Verzeichnis im Plugin, Aufruf via Bash |
| 10 | Vorschlag evaluiert? | Bestaetigt Richtung, kennt aber Weave nicht. Discovery ist weiter |
| 11 | 5 Schichten noetig? | Nein, 3 reichen |
| 12 | Weave MCP CRDT als State nutzen? | Nein, lokal. GitHub Issues als Remote State gewaehlt |
| 13 | Merge Queue automatisieren? | Nein, manueller Merge im MVP. Dev entscheidet Reihenfolge |
| 14 | Phase 4b: Sub-Agent oder Orchestrator-inline? | Sub-Agent (frischer Context zuverlaessiger als Orchestrator nach langem Run) |
| 15 | Was macht der Sub-Agent? | NUR Issue-Comment schreiben. Alles andere deterministisch im Script |
| 16 | Agent immer oder nur bei Overlap? | Nur bei Overlap (~2%). In 98% der Faelle nur Script (0 API-Kosten) |
| 17 | Weave MCP oder CLI? | CLI (`weave-cli preview`). Aus Scripts aufrufbar, keine MCP-Dependency |
