# Feature: Conflict-Aware Agent Pipeline

**Epic:** Pipeline Externalization & Multi-Session Coordination
**Status:** Draft
**Discovery:** `discovery.md` (same folder)
**Derived from:** Discovery constraints, NFRs, and risks

---

## Problem & Solution

**Problem:**
- Mehrere Pipeline-Sessions arbeiten parallel am selben Repo (Solo-Dev Multi-Session ODER Multi-Dev)
- Keine Session weiss welche Dateien/Entities andere Sessions aendern
- Merge-Konflikte entstehen erst beim Merge, muessen manuell geloest werden
- Kein Ueberblick ueber laufende Sessions und deren Aenderungen

**Solution:**
- Worktree-Isolation: Orchestrator erstellt Worktree + Branch bei Start
- Git diff Hunk-Header-Parsing als primaere Entity-Extraktion (zero dependencies)
- Weave als optionaler Merge Driver fuer automatische Entity-Level Merges
- Deterministisches Node.js Script (`conflict-scanner.js`): Entity-Analyse, GitHub Issue mit Claims, Overlap-Berechnung
- LLM Sub-Agent (`conflict-reporter`): Menschenlesbare Issue-Comments NUR bei Overlap (~2%)
- GitHub Issues als Remote Session-Registry (Cross-Machine, PM-sichtbar)

**Business Value:**
- Pipeline laeuft autonom durch, auch bei paralleler Entwicklung
- Entity-Level Sichtbarkeit: PM/Dev sieht welche Funktionen/Klassen in Konflikt stehen
- Multi-Dev-Faehigkeit ab Tag 1 (GitHub Issues als Remote State)
- Zero extra Infrastruktur (Git + GitHub CLI + Node.js)

---

## Scope & Boundaries

| In Scope |
|----------|
| Worktree-Isolation: Orchestrator erstellt automatisch Worktree + Branch bei Start |
| Optionaler Weave Setup: Merge Driver + `.gitattributes` Config |
| `git rerere` Aktivierung fuer wiederkehrende Conflict-Patterns |
| GitHub Session-Registry: Issue pro Pipeline-Run mit Entity-Level Claims (JSON) |
| Conflict-Scanner Script (`conflict-scanner.js`): git diff Hunk-Headers → claims.json + overlap-report.json |
| Conflict-Reporter Sub-Agent: Menschenlesbare Issue-Comments (nur bei Overlap) |
| Orchestrator Integration: Phase 4b nach Final Validation |
| Plugin-Packaging: Script in `plugins/clemens/scripts/`, Agent in `plugins/clemens/agents/` |

| Out of Scope |
|--------------|
| LLM-basierte Konfliktloesung (gleiche Entity verschiedene Aenderungen) |
| Inline Conflict-Checks waehrend Implementation |
| Architecture-Integration (Fruehwarnung nach Gate 1) |
| Weave CRDT State Sync (Multi-Machine) |
| Merge Queue Automatisierung (manueller Merge im MVP) |
| Dependency-Aware Merge-Reihenfolge |
| Dashboard / Echtzeit-Monitoring |
| Slack/Email Notifications |

---

## API Design

> Kein Web-API. Stattdessen: Script CLI Interface, GitHub Issue API (via gh CLI), Sub-Agent Task() Contract.

### Overview

| Aspect | Specification |
|--------|---------------|
| Style | CLI Script + GitHub API (via `gh` CLI) + Sub-Agent (via `Task()`) |
| Authentication | GitHub CLI auth (`gh auth login`, pre-configured) |
| Rate Limiting | GitHub API: 5000 req/h (authenticated). Script nutzt < 10 Calls pro Run |

### Script CLI Interface

| Argument | Required | Description | Example |
|----------|----------|-------------|---------|
| `--branch` | Yes | Feature-Branch Name | `feature/workspace-redesign` |
| `--spec-path` | Yes | Spec-Ordner (relativ) | `specs/2026-03-09-workspace/` |
| `--repo` | Yes | GitHub Repo (owner/name) | `clemens/cc-agents` |
| `--weave` | No | Weave CLI fuer Entity-Analyse nutzen (default: false) | `--weave` |

| Exit Code | Meaning | Orchestrator Action |
|-----------|---------|---------------------|
| 0 | Kein Overlap | Weiter zu Phase 4b Step 3 (Label setzen) |
| 1 | Overlap gefunden | Task(conflict-reporter), dann Step 3 |
| 2 | Fehler (gh/git nicht verfuegbar, Parse-Error) | Log Warning, weiter ohne Conflict Scan |

### GitHub Issue API (via gh CLI)

| Operation | Command | When |
|-----------|---------|------|
| Issue erstellen | `gh issue create --repo {repo} --title "Pipeline: {feature}" --label "pipeline:running" --body "{json}"` | Script Step c |
| Andere Issues lesen | `gh issue list --repo {repo} --label "pipeline:running" --json number,title,body` | Script Step d |
| Label aendern | `gh issue edit {number} --repo {repo} --remove-label "pipeline:running" --add-label "pipeline:merge-ready"` | Orchestrator Step 3 |
| Comment schreiben | `gh issue comment {number} --repo {repo} --body "{markdown}"` | Reporter Agent |

### Sub-Agent Task() Contract

**Input (Prompt):**

| Field | Type | Description |
|-------|------|-------------|
| overlap_report_path | String | Absoluter Pfad zu `overlap-report.json` |
| own_issue_number | Integer | Eigene GitHub Issue-Nummer |
| repo | String | GitHub Repo (owner/name) |

**Output (JSON):**

| Field | Type | Description |
|-------|------|-------------|
| status | `"completed"` / `"failed"` | Ergebnis |
| commented | Boolean | Ob Comments geschrieben wurden |
| issues_commented | Integer[] | Issue-Nummern die kommentiert wurden |
| notes | String | Zusammenfassung |

---

## Database Schema

> Kein SQL-Datenbank. File-basierte JSON Schemas + GitHub Issue Body.

### Entities

| Entity | Storage | Purpose | Key Fields |
|--------|---------|---------|------------|
| claims.json | Lokale Datei (`{spec_path}/claims.json`) | Eigene Entity-Claims | entities_changed[], summary |
| overlap-report.json | Lokale Datei (`{spec_path}/overlap-report.json`) | Overlap-Analyse Ergebnis | overlaps[], weave_validation, summary |
| GitHub Issue Body | GitHub API | Remote Session-Registry | session JSON + entity claims JSON |
| .orchestrator-state.json | Lokale Datei (`{spec_path}/`) | Pipeline-State (erweitert) | current_state inkl. "conflict_scan" |

### Schema Details: claims.json

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `entities_changed[]` | Array | Non-empty | Geaenderte Entities |
| `entities_changed[].file` | String | Valid relative path | Relativer Pfad zur Datei |
| `entities_changed[].entity` | String / null | — | Entity-Name aus Hunk-Header, null fuer neue Dateien |
| `entities_changed[].entity_type` | Enum | `function` / `class` / `method` / `new_file` / `unknown` | Aus Hunk-Header heuristisch |
| `entities_changed[].lines` | [Integer, Integer] | [start, end] | Zeilen-Range |
| `entities_changed[].diff_summary` | String | — | z.B. "+9 -3" |
| `summary.files_changed` | Integer | >= 0 | Anzahl geaenderter Dateien |
| `summary.entities_changed` | Integer | >= 0 | Anzahl geaenderter Entities |
| `summary.new_files` | Integer | >= 0 | Anzahl neuer Dateien |

### Schema Details: overlap-report.json

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `session_id` | String | UUID v4 | Generiert beim Script-Start |
| `feature` | String | Non-empty | Feature-Name aus --branch |
| `branch` | String | Non-empty | Branch-Name |
| `scan_timestamp` | String | ISO 8601 | Zeitpunkt des Scans |
| `entities_changed[]` | Array | — | Kopie aus claims.json |
| `overlaps[]` | Array | — | Gefundene Overlaps (kann leer sein) |
| `overlaps[].file` | String | — | Betroffene Datei |
| `overlaps[].our_entity` | String | — | Unsere Entity |
| `overlaps[].their_entity` | String | — | Deren Entity |
| `overlaps[].their_issue` | Integer | — | GitHub Issue-Nummer |
| `overlaps[].their_feature` | String | — | Feature-Name der anderen Session |
| `overlaps[].their_user` | String | — | GitHub-Username (Assignee) |
| `overlaps[].overlap_type` | Enum | `same_entity` / `same_file_different_entity` | Art des Overlaps |
| `overlaps[].severity` | Enum | `low` / `high` | Schweregrad |
| `weave_validation` | Object / null | null wenn `--weave` nicht genutzt | Aus `weave-cli preview` Output geparst (siehe unten) |
| `weave_validation.auto_resolvable` | Boolean | — | Ob Weave alle Overlaps automatisch loesen kann |
| `weave_validation.conflict_entities` | String[] | — | Entity-Namen die Weave NICHT loesen kann |
| `weave_validation.confidence` | Enum | `high` / `medium` / `low` | Konfidenz der Weave-Analyse |
| `summary.files_changed` | Integer | >= 0 | Anzahl geaenderter Dateien (Kopie aus claims) |
| `summary.entities_changed` | Integer | >= 0 | Anzahl geaenderter Entities (Kopie aus claims) |
| `summary.new_files` | Integer | >= 0 | Anzahl neuer Dateien (Kopie aus claims) |
| `summary.overlapping_files` | Integer | >= 0 | Dateien mit Overlap |
| `summary.overlapping_entities` | Integer | >= 0 | Entities mit Overlap |
| `summary.max_severity` | Enum | `none` / `low` / `high` | Hoechster Schweregrad |

**weave_validation Herleitung:**
- Nur befuellt wenn `--weave` Flag gesetzt UND `weave-cli` installiert ist
- Daten werden aus `weave-cli preview main` Text-Output geparst: Entity-Match-Status, Conflict-Status pro Datei
- Wenn Weave nicht verfuegbar: `weave_validation: null`
- Kein separater `weave_validate_merge` Befehl — alles aus `weave-cli preview` abgeleitet

### Schema Details: GitHub Issue Body

```markdown
## Session

\`\`\`json
{
  "session_id": "uuid-v4",
  "feature": "feature-name",
  "branch": "feature/feature-name",
  "spec_path": "specs/2026-03-09-feature/",
  "started_at": "ISO-8601"
}
\`\`\`

## Entity Claims

\`\`\`json
{
  "entities_changed": [...],
  "summary": { "files_changed": N, "entities_changed": N, "new_files": N }
}
\`\`\`
```

---

## Server Logic

> Script-Module statt Server-Services. Alles in einer Datei (`conflict-scanner.js`).

### Modules & Processing

| Module | Responsibility | Input | Output | Side Effects |
|--------|----------------|-------|--------|--------------|
| CLI Parser | Args parsen, validieren | process.argv | `{ branch, specPath, repo, useWeave }` | Exit 2 bei ungueltigem Input |
| Entity Extractor | Entity-Level Changes extrahieren | branch name | `entities_changed[]` | Liest git diff / weave preview |
| Claims Writer | claims.json schreiben | entities_changed, summary | claims.json Datei | Filesystem Write |
| Session Registry | GitHub Issue erstellen, andere lesen | repo, feature, claims | `{ ownIssue, otherSessions[] }` | gh issue create, gh issue list |
| Overlap Calculator | Entity-Overlap berechnen | eigene claims, andere sessions' claims | `overlaps[]` | Keine |
| Report Writer | overlap-report.json schreiben | Alle Daten | overlap-report.json Datei | Filesystem Write |
| Exit Handler | Exit-Code setzen | overlaps | Process exit (0/1/2) | stdout: JSON summary |

### Business Logic Flow

```
CLI Args → Validate → Entity Extractor → Claims Writer
                                              ↓
                                    Session Registry (gh)
                                              ↓
                                    Overlap Calculator
                                              ↓
                                    Report Writer → Exit Code
```

### Entity Extraction Strategy

| Method | When | How | Accuracy |
|--------|------|-----|----------|
| **Git diff Hunk Headers** (PRIMARY) | Immer | `git diff main...{branch} --stat --unified=0 -p` → Parse `@@` Hunk Headers | Gut (Entity-Name aus funcname) |
| **Weave CLI Preview** (OPTIONAL) | `--weave` Flag + `weave-cli` installiert | `weave-cli preview main` → Parse Text Output | Sehr gut (Tree-sitter AST) |

**Git diff Hunk Header Parsing:**

```
@@ -42,10 +42,15 @@ function PromptArea() {
                        ^^^^^^^^^^^^^^^^^^^^^^^^
                        → entity: "PromptArea", entity_type: "function"

@@ -1,0 +1,45 @@
→ entity: null, entity_type: "new_file" (wenn Datei neu)
```

**Entity-Typ Heuristik aus Hunk Header:**

| Pattern | entity_type | Example |
|---------|-------------|---------|
| `function {name}` | `function` | `function PromptArea()` |
| `class {name}` | `class` | `class UserService` |
| `def {name}` | `function` | `def calculate_overlap(self)` |
| `func {name}` | `function` | `func (s *Scanner) Run()` |
| `{name}.*method` / indent | `method` | `  async handleSubmit()` |
| Kein Match | `unknown` | — |
| Neue Datei (alle Hunks +) | `new_file` | — |

### Overlap-Berechnung (deterministisch)

```
FOR each own_entity IN entities_changed:
  FOR each other_session IN other_sessions:
    FOR each their_entity IN other_session.entities_changed:
      IF own_entity.file == their_entity.file:
        IF own_entity.entity == their_entity.entity AND own_entity.entity != null:
          → overlap_type: "same_entity", severity: "high"
        ELSE:
          → overlap_type: "same_file_different_entity", severity: "low"
```

### Validation Rules

| Input | Rule | Error |
|-------|------|-------|
| --branch | Must start with `feature/` or be non-empty | Exit 2: "Invalid branch" |
| --spec-path | Directory must exist | Exit 2: "Spec path not found" |
| --repo | Must match `owner/repo` pattern | Exit 2: "Invalid repo format" |
| gh auth | `gh auth status` must succeed | Exit 2: "GitHub CLI not authenticated" |
| git | Must be in a git repository | Exit 2: "Not a git repository" |

---

## Security

### Authentication & Authorization

| Area | Mechanism | Notes |
|------|-----------|-------|
| GitHub API | `gh` CLI with pre-configured auth (`gh auth login`) | Token stored by gh, nicht im Script |
| Repo Access | GitHub permissions des authentifizierten Users | Read/Write Issues Berechtigung noetig |
| Script Execution | Lokal, keine Remote-Ausfuehrung | Laeuft im Orchestrator-Kontext |

### Data Protection

| Data Type | Protection | Notes |
|-----------|------------|-------|
| GitHub Token | Managed by `gh` CLI | Nicht im Script, nicht in Logs |
| File Paths | Relative Pfade in Issues | Keine absoluten Pfade exponieren |
| Code Content | Nicht in Issues | Nur Entity-Namen und Zeilen-Ranges, kein Source Code |

### Input Validation & Sanitization

| Input | Validation | Sanitization |
|-------|------------|--------------|
| CLI Arguments | Regex-Check fuer Repo-Format, Path-Existenz | Shell-Escape fuer gh CLI Aufrufe |
| GitHub Issue Body (fremde) | JSON.parse in try/catch | Unbekannte Felder ignorieren |
| Hunk Header Output | Regex-Match, kein eval | Nur gematchte Entity-Namen verwenden |

### Rate Limiting & Abuse Prevention

| Resource | Limit | Notes |
|----------|-------|-------|
| GitHub API | 5000/h (authenticated) | Script nutzt < 10 Calls |
| gh issue list | Max 100 Issues (--limit 100) | Genuegt fuer parallele Sessions |
| Script Execution | Einmal pro Pipeline-Run | Kein Retry-Loop im Script |

---

## Architecture Layers

### Layer Responsibilities

| Layer | Responsibility | Pattern |
|-------|----------------|---------|
| Orchestrator (Phase 4b) | Script aufrufen, Exit-Code pruefen, Agent bei Overlap, Label setzen | Pipeline Phase Pattern |
| Script (`conflict-scanner.js`) | Entity-Extraktion, Claims, Issue-Erstellung, Overlap-Berechnung | CLI Tool Pattern |
| Sub-Agent (`conflict-reporter`) | Overlap-Report lesen, menschenlesbare Comments schreiben | Fresh Context Sub-Agent Pattern |
| State (GitHub Issues) | Session-Registry, Cross-Machine Sichtbarkeit | Remote State Pattern |
| State (Lokale JSON) | claims.json, overlap-report.json | File-based State Pattern |

### Data Flow

```
Orchestrator (Phase 4b)
  │
  ├── Step 1: Bash("node conflict-scanner.js --branch ... --spec-path ... --repo ...")
  │     │
  │     ├── git diff main...{branch}  →  Entity Extraction
  │     ├── gh issue create           →  Session Registry (eigenes Issue)
  │     ├── gh issue list             →  Andere Sessions lesen
  │     ├── Overlap Calculation       →  Deterministisch
  │     ├── claims.json              →  Lokale Datei
  │     └── overlap-report.json      →  Lokale Datei
  │     Exit Code: 0 (kein Overlap) / 1 (Overlap) / 2 (Fehler)
  │
  ├── Step 2 (nur bei Exit 1):
  │     Task(conflict-reporter)
  │     │
  │     ├── Read: overlap-report.json
  │     ├── Kontext + Empfehlung formulieren
  │     ├── gh issue comment {own_issue}
  │     └── gh issue comment {their_issues}
  │
  └── Step 3: Bash("gh issue edit {issue} --remove-label pipeline:running --add-label pipeline:merge-ready")
```

### Error Handling Strategy

| Error Type | Handling | Orchestrator Response | Logging |
|------------|----------|----------------------|---------|
| Script Exit 0 | Kein Overlap | Weiter zu Step 3 | Info: "No conflicts detected" |
| Script Exit 1 | Overlap gefunden | Task(conflict-reporter), dann Step 3 | Info: "Overlaps found: {summary}" |
| Script Exit 2 | Fehler (gh/git) | Log Warning, weiter ohne Conflict Scan | Warning: "Conflict scan failed: {stderr}" |
| gh nicht installiert | Script Exit 2 | Skip Phase 4b | Warning |
| gh nicht authentifiziert | Script Exit 2 | Skip Phase 4b | Warning |
| JSON Parse Error (fremdes Issue) | Skip diese Session | Andere Sessions weiter pruefen | Warning: "Skipping issue #{n}: invalid JSON" |
| Reporter Agent failed | Log, weiter | Label trotzdem setzen | Warning: "Reporter failed" |

---

## Migration Map

> Orchestrator Commands werden um Phase 4b und Worktree-Support erweitert.

| Existing File | Current Pattern | Target Pattern | Specific Changes |
|---|---|---|---|
| `plugins/clemens/commands/orchestrate.md` | Phase 4 → Phase 5 (Completion) | Phase 4 → Phase 4b (Conflict Scan) → Phase 5 | Neuer Abschnitt "Phase 4b: Conflict Scan" mit 3 Steps einfuegen. Phase 2 State um `conflict_scan` / `conflict_report` States erweitern. Worktree-Erstellung in Phase 2 hinzufuegen. |
| `plugins/clemens/commands/slim-orchestrate.md` | Phase 4 → Phase 5 (Completion) | Phase 4 → Phase 4b (Conflict Scan) → Phase 5 | Identische Aenderungen wie orchestrate.md |

---

## Constraints & Integrations

### Constraints

| Constraint | Technical Implication | Solution |
|------------|----------------------|----------|
| Cross-Platform (Win/Mac/Linux) | Script muss auf allen OS laufen | Node.js (path.posix fuer Pfade), git/gh CLI |
| Zero npm Dependencies | Script darf kein package.json haben | Nur Node.js Built-ins: child_process, fs, path, crypto |
| Maximal deterministisch | Script-Logik muss reproduzierbar sein | Keine LLM-Calls im Script, nur strukturierte Vergleiche |
| Plugin-Packaging | Script muss im Plugin-Verzeichnis leben | `plugins/clemens/scripts/conflict-scanner.js` |
| Non-blocking | Conflict Scan darf Pipeline nicht blocken | Exit 2 = Warning, Pipeline geht weiter |
| Kosten-effizient | LLM-Calls minimieren | Sub-Agent nur bei Overlap (~2%), sonst $0 |

### Integrations

| Area | System / Capability | Interface | Version | Notes |
|------|----------------------|-----------|---------|-------|
| Entity Extraction (Primary) | Git | `git diff main...{branch}` Hunk Headers | Git 2.x (pre-installed) | Funcname-Patterns aus .gitattributes oder Built-in |
| Entity Extraction (Optional) | Weave CLI | `weave-cli preview main` | v0.2.3 (2026-03-09, GitHub Releases) | Tree-sitter AST, 17 Sprachen. Nur mit `--weave` Flag |
| Merge Driver (Optional) | Weave Driver | Git merge driver (automatic) | v0.2.3 (2026-03-09, GitHub Releases) | Entity-Level Merge bei `git merge` |
| Session Registry | GitHub Issues API | `gh` CLI (create, list, edit, comment) | gh >=2.85.0 (tested: v2.87.3, 2026-02-23, GitHub Releases) | Remote State, Cross-Machine |
| Script Runtime | Node.js | Built-in modules (child_process, fs, path, crypto) | 24.x LTS (24.14.0, nodejs.org) | Auch 22.x LTS kompatibel |
| Sub-Agent Execution | Claude Code Task() | `subagent_type: "conflict-reporter"` | Plugin v1.1.0+ | Fresh Context Pattern |
| Worktree Isolation | Git Worktrees | `git worktree add` | Git 2.x | Separater Working Tree + Branch |
| Conflict Memory | git rerere | `git config rerere.enabled true` | Git 2.x | Remembered resolutions |

---

## Quality Attributes (NFRs)

### From Discovery → Technical Solution

| Attribute | Target | Technical Approach | Measure / Verify |
|-----------|--------|--------------------|------------------|
| Cross-Platform | Windows + Mac + Linux | Node.js Script, keine OS-spezifischen APIs, `path.join` statt Hardcoded-Separators | Test auf Win + Mac |
| Cost Efficiency | 98% Runs $0 API-Kosten | Script deterministisch (immer). Sub-Agent (LLM) nur bei Overlap (~2%) | Track Exit-Codes ueber Issues |
| Determinism | Gleicher Input = Gleicher Output | Kein LLM im Script. Overlap = strukturierter Vergleich | Unit Tests mit fixen Fixtures |
| Performance | Conflict Scan < 30s total | Script < 10s (git diff + gh API). Agent < 20s (nur bei Overlap) | Zeitmessung im Script |
| Reliability | Kein Pipeline-Blocker | Exit 2 = Warning, Pipeline geht weiter. Agent-Failure = Log, weiter | E2E Test: gh offline → Exit 2 → Pipeline completes |
| Extensibility | Weave als Enhancement | `--weave` Flag fuer optionale bessere Entity-Analyse | Feature Flag Pattern |

### Monitoring & Observability

| Metric | Type | Target | Method |
|--------|------|--------|--------|
| Script Exit Code | Counter | Meiste 0, wenige 1, keine 2 | GitHub Issue Labels (running/merge-ready) |
| Overlap Count | Gauge | < 5% der Runs | overlap-report.json summary |
| Entity Accuracy | Manual | Hunk-Header Entity-Namen stimmen | Stichproben-Review |

---

## Risks & Assumptions

### Assumptions

| Assumption | Technical Validation | Impact if Wrong |
|------------|---------------------|-----------------|
| `gh` CLI ist installiert und authentifiziert | `gh auth status` Check im Script | Exit 2, Pipeline weiter ohne Conflict Scan |
| Git Hunk Headers liefern brauchbare Entity-Namen | Git funcname Patterns fuer gaengige Sprachen | Entity-Name "unknown", Overlap-Erkennung nur auf File-Level |
| GitHub Issues Body < 65536 chars | Claims JSON fuer typische Features ~2-5 KB | Large-Feature: Claims kuerzen (nur Top-50 Entities) |
| Andere Sessions schreiben korrektes JSON im Issue Body | Script parst JSON defensiv (try/catch) | Skip korrupte Issues, log Warning |
| Maximal ~20 parallele Sessions | `gh issue list --limit 100` reicht | Erhoehen auf --limit 500 |
| Feature-Branch heisst `feature/*` | Convention im Team | Argument --branch erlaubt beliebige Branch-Namen |

### Risks & Mitigation

| Risk | Likelihood | Impact | Technical Mitigation | Fallback |
|------|------------|--------|---------------------|----------|
| Weave CLI Format aendert sich (v0.2.x) | Medium | Low | Git diff als PRIMARY Methode, Weave nur optional | `--weave` Flag weglassen |
| GitHub API Rate Limit | Low | Medium | < 10 API Calls pro Run, Authenticated (5000/h) | Retry mit Backoff im Script |
| Hunk Header ohne Entity-Name | Medium | Low | Fallback: `entity: null, entity_type: "unknown"` | Overlap nur auf File-Level |
| Fremdes Issue hat kaputtes JSON | Low | Low | try/catch, skip corrupt Issue | Warnung im Log, andere Sessions weiter pruefen |
| Git Worktree Cleanup vergessen | Low | Medium | Worktree-Liste in State, Cleanup in Phase 5 | `git worktree prune` manuell |
| Script auf Windows: Path-Separator | Medium | Low | `path.join()` statt String-Concatenation | Tests auf Windows |

---

## Technology Decisions

### Stack Choices

| Area | Technology | Rationale |
|------|------------|-----------|
| Entity Extraction | Git diff Hunk Headers (primary) | Zero dependencies, works everywhere Git is installed, funcname patterns for 20+ languages |
| Entity Extraction | Weave CLI (optional enhancement) | Tree-sitter AST, 17 languages, better accuracy — but v0.2.x, active development |
| Session Registry | GitHub Issues | Remote State, Cross-Machine, PM-sichtbar, `gh` CLI, keine extra Infrastruktur |
| Script Runtime | Node.js (built-ins only) | Cross-Platform, Claude Code prerequisite, keine npm dependencies |
| Sub-Agent | Claude Code Task() | Fresh Context Pattern, JSON output contract, bestehende Orchestrator-Integration |
| Merge Driver | Weave Driver (optional) | Entity-Level Merge, 31/31 benchmark, automatic nach Setup |
| Conflict Memory | git rerere | Built-in, records + replays merge resolutions |

### Trade-offs

| Decision | Pro | Con | Mitigation |
|----------|-----|-----|------------|
| Git diff primary statt Weave | Zero dependencies, immer verfuegbar | Weniger akkurat als Tree-sitter AST | `--weave` Flag fuer bessere Analyse wenn installiert |
| GitHub Issues statt Weave CRDT | Remote State, Cross-Machine, PM-sichtbar | Nicht Echtzeit, API-Latenz | Ausreichend fuer post-Implementation Scan |
| Einzelnes Script statt npm Package | Zero setup, copy to plugin dir | Alles in einer Datei (~300-400 LOC) | Klare Modul-Struktur innerhalb der Datei |
| Sub-Agent nur bei Overlap | 98% Runs $0 API-Kosten | Kein menschenlesbarer Comment bei kein Overlap | Issue-Titel + Labels genuegen bei kein Overlap |
| Non-blocking Conflict Scan | Pipeline nie blockiert | Konflikte werden nur gemeldet, nicht verhindert | Bewusste Entscheidung: Erkennung > Praevention im MVP |

---

## Open Questions

| # | Question | Options | Recommended | Decision |
|---|----------|---------|-------------|----------|
| — | Keine offenen Fragen | — | — | Alle Entscheidungen getroffen |

---

## Context & Research

### Weave CLI Documentation

- **Weave v0.2.3** (2026-03-09): Entity-Level Semantic Merge Driver
- 17 Sprachen via Tree-sitter: TypeScript, Python, Go, Rust, Java, C, C++, Ruby, C#, PHP, Swift, Fortran, JSON, YAML, TOML, CSV, Markdown
- Commands: `weave setup`, `weave preview <branch>`, `weave bench`
- Benchmark: 31/31 clean merges vs. Git's 15/31
- Separate Binaries: weave-cli, weave-driver, weave-mcp
- MCP Server nicht im MVP genutzt (nur Agent-Context, nicht Script-Context)

### Git Diff Hunk Header Entity Extraction

- Git diff `@@` lines include "funcname" context: `@@ -42,10 +42,15 @@ function PromptArea() {`
- Built-in patterns for C, C++, Java, Python, Ruby, Go, Rust, PHP, Perl, CSS, HTML
- Custom patterns via `.gitattributes`: `*.ts diff=typescript`
- Limitations: Nur naechste umgebende Entity, keine Nested-Entity-Aufloesung
- Adequate fuer Overlap-Erkennung (Datei + Entity-Name genuegt)

### Existing Orchestrator Architecture

- 2 Varianten: `orchestrate.md` (Standard) und `slim-orchestrate.md` (AC-basiert)
- Phase-Struktur: 1 → 1b → 2 → 2b → 3 (Waves) → 4 (Final) → 5 (Completion)
- Phase 4b wird zwischen Phase 4 und Phase 5 eingefuegt
- State-Machine: `.orchestrator-state.json` mit `current_state` Field
- Sub-Agent Pattern: `Task(subagent_type, prompt)` → JSON Output → `parse_agent_json()`
- Evidence: `.claude/evidence/{feature}/` mit JSON-Dateien pro Slice

---

## Research Log

| Date | Area | Finding |
|------|------|---------|
| 2026-03-09 | Web | Weave CLI v0.2.3 (2026-03-09): setup, preview, bench. 17 Sprachen. No --json flag documented |
| 2026-03-09 | Web | GitHub CLI v2.87.3 (2026-02-23): `gh issue create/list/edit/comment` mit --json Output |
| 2026-03-09 | Web | Node.js 24.x LTS (24.14.0): Active LTS bis Oct 2026 |
| 2026-03-09 | Codebase | orchestrate.md: Phase 4 (Final Validation) → Phase 5 (Completion). Integration-Punkt klar |
| 2026-03-09 | Codebase | slim-orchestrate.md: Gleiche Phase-Struktur, gleiche Aenderungen noetig |
| 2026-03-09 | Codebase | Task() Pattern: subagent_type + prompt → JSON Output via parse_agent_json() |
| 2026-03-09 | Codebase | State: .orchestrator-state.json mit current_state Field. Neue States noetig |
| 2026-03-09 | Codebase | Plugin: 21 agents, 13 commands, templates/. Kein scripts/ Verzeichnis bisher |
| 2026-03-09 | Codebase | Kein package.json, kein .gitattributes, kein Weave-Setup bisher |
| 2026-03-09 | Web | Git diff funcname: Built-in Patterns fuer 10+ Sprachen, Custom via .gitattributes |

---

## Q&A Log

| # | Question | Answer |
|---|----------|--------|
| 1 | Architecture-Tiefe: Wie tief soll die Architecture gehen? (Kurz / Standard / Detailliert) | Standard: Script-Architektur, Agent-Definition, Orchestrator-Integration, Error Handling, Security. Kein Code. |
| 2 | weave preview hat kein dokumentiertes --json Flag. Wie damit umgehen? (Git diff primary / Weave parsen / Beides gleichwertig) | Git diff Fallback priorisieren: git diff main...HEAD mit Hunk-Header-Parsing als primaere Methode. Weave CLI als optionales Enhancement wenn installiert. |
