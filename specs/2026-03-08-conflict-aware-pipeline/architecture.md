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
- Two-Phase Claims: Pre-Scan (predicted, aus Spec-Deliverables) VOR Implementation + Post-Scan (actual, aus git diff) NACH Implementation
- Worktree Setup in Phase 0: Neuer Worktree brancht von latest main, existierender wird rebaset. Agent prueft automatisch
- Worktree-Isolation: Orchestrator erstellt Worktree + Branch bei Start
- Conflict-Scanner Sub-Agent (LLM): Liest Specs/Diffs nativ, ruft gh/git CLI via Bash auf, schreibt JSON-Dateien. Zwei Aufruf-Varianten: Pre-Scan (predicted Claims) und Post-Scan (actual Claims)
- Conflict-Reporter Sub-Agent (LLM): Menschenlesbare Issue-Comments NUR bei Post-Scan Overlap (~2%)
- GitHub Issues als Remote Session-Registry (Cross-Machine, PM-sichtbar, Two-Phase Claims)

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
| Conflict-Scanner Sub-Agent: Pre-Scan (File-Level Claims aus Spec) + Post-Scan (Entity-Level Claims aus git diff) |
| Conflict-Reporter Sub-Agent: Menschenlesbare Issue-Comments (nur bei Post-Scan Overlap) |
| Orchestrator Integration: Phase 0 (Worktree Setup + Pre-Scan) + Phase 4b (Post-Scan + Reporter) |
| Plugin-Packaging: Agent-Definitionen in `plugins/clemens/agents/` |

| Out of Scope |
|--------------|
| LLM-basierte Konfliktloesung (gleiche Entity verschiedene Aenderungen) |
| Inline Conflict-Checks waehrend Implementation |
| Architecture-Integration (Fruehwarnung nach Gate 1) |
| Merge Queue Automatisierung (manueller Merge im MVP) |
| Dependency-Aware Merge-Reihenfolge |
| Dashboard / Echtzeit-Monitoring |
| Slack/Email Notifications |

---

## API Design

> Kein Web-API. Stattdessen: Sub-Agent Task() Contracts + GitHub Issue API (via gh CLI im Agent).

### Overview

| Aspect | Specification |
|--------|---------------|
| Style | Sub-Agents (via `Task()`) + GitHub API (via `gh` CLI in Agent-Bash) |
| Authentication | GitHub CLI auth (`gh auth login`, pre-configured) |
| Rate Limiting | GitHub API: 5000 req/h (authenticated). Agents nutzen < 10 Calls pro Run |

### Conflict-Scanner Agent Task() Contract

**Pre-Scan (Phase 0) — Input:**

| Field | Type | Description |
|-------|------|-------------|
| mode | `"predict"` | Scan-Modus |
| spec_path | String | Spec-Ordner (relativ) |
| repo | String | GitHub Repo (owner/name) |

**Pre-Scan — Output (JSON):**

| Field | Type | Description |
|-------|------|-------------|
| status | `"completed"` / `"failed"` | Ergebnis |
| has_overlap | Boolean | Ob File-Level Overlap gefunden wurde |
| issue_number | Integer | Erstellte GitHub Issue-Nummer |
| overlaps | Object[] | Gefundene File-Level Overlaps (kann leer sein) |
| files_claimed | Integer | Anzahl geclaimter Dateien |
| notes | String | Advisory-Zusammenfassung |

**Post-Scan (Phase 4b) — Input:**

| Field | Type | Description |
|-------|------|-------------|
| mode | `"actual"` | Scan-Modus |
| branch | String | Feature-Branch Name (fuer git diff) |
| spec_path | String | Spec-Ordner (relativ) |
| repo | String | GitHub Repo (owner/name) |
| issue_number | Integer | Existierende Issue-Nummer (aus Phase 0) |

**Post-Scan — Output (JSON):**

| Field | Type | Description |
|-------|------|-------------|
| status | `"completed"` / `"failed"` | Ergebnis |
| has_overlap | Boolean | Ob Entity-Level Overlap gefunden wurde |
| overlaps | Object[] | Gefundene Entity-Level Overlaps |
| summary | Object | `{ files_changed, entities_changed, max_severity }` |
| notes | String | Zusammenfassung |

### Conflict-Reporter Agent Task() Contract

**Input:**

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

### GitHub Issue API (via gh CLI im Agent)

| Operation | Command | When |
|-----------|---------|------|
| Issue erstellen | `gh issue create --repo {repo} --title "Pipeline: {feature}" --label "pipeline:running" --body "{json}"` | Scanner-Agent Pre-Scan |
| Andere Issues lesen | `gh issue list --repo {repo} --label "pipeline:running" --json number,title,body` | Scanner-Agent (Pre + Post) |
| Issue Body updaten | `gh issue edit {number} --repo {repo} --body "{updated_json}"` | Scanner-Agent Post-Scan |
| Label aendern | `gh issue edit {number} --repo {repo} --remove-label "pipeline:running" --add-label "pipeline:merge-ready"` | Orchestrator Phase 4b Step 3 |
| Comment schreiben | `gh issue comment {number} --repo {repo} --body "{markdown}"` | Reporter-Agent |

---

## Database Schema

> Kein SQL-Datenbank. File-basierte JSON Schemas + GitHub Issue Body.

### Entities

| Entity | Storage | Purpose | Key Fields | Phase |
|--------|---------|---------|------------|-------|
| predicted-claims.json | Lokale Datei (`{spec_path}/predicted-claims.json`) | Predicted File-Level Claims aus Spec | files_claimed[], summary | Phase 0 |
| claims.json | Lokale Datei (`{spec_path}/claims.json`) | Actual Entity-Level Claims aus git diff | entities_changed[], summary | Phase 4b |
| overlap-report.json | Lokale Datei (`{spec_path}/overlap-report.json`) | Overlap-Analyse Ergebnis (nur Post-Scan) | overlaps[], summary | Phase 4b |
| GitHub Issue Body | GitHub API | Remote Session-Registry (Two-Phase) | session JSON + claims JSON (erst predicted, dann actual) | Phase 0 + 4b |
| .orchestrator-state.json | Lokale Datei (`{spec_path}/`) | Pipeline-State (erweitert) | current_state inkl. "worktree_setup", "pre_scan", "conflict_scan", "conflict_report"; worktree_path, branch, issue_number | Phase 0 + 4b |

**State-Transitions (Phase 0 + 4b):**

```
Phase 0:
  → current_state = "worktree_setup"   (Worktree erstellen/rebasen)
  → state.worktree_path = "worktrees/{feature}"
  → state.branch = "feature/{feature}"
  → current_state = "pre_scan"          (Scanner-Agent Pre-Scan)
  → state.issue_number = N              (aus Scanner-Agent Output)
  → current_state = "implementing"      (weiter mit Phase 1)

Phase 4b (nach Phase 4 "final_validation"):
  → current_state = "conflict_scan"     (Scanner-Agent Post-Scan)
  → current_state = "conflict_report"   (Reporter-Agent, nur bei Overlap)
  → current_state = "feature_complete"   (weiter mit Phase 5)
```

### Schema Details: predicted-claims.json (Phase 0)

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `files_claimed[]` | Array | Non-empty | Dateipfade aus Slice-Spec Deliverables |
| `files_claimed[].file` | String | Valid relative path | Relativer Pfad aus Slice-Deliverables |
| `files_claimed[].action` | Enum | `create` / `modify` | Neue Datei oder bestehende Aenderung |
| `files_claimed[].source_slice` | String | Slice-Name | Aus welchem Slice die Claim kommt |
| `summary.files_claimed` | Integer | >= 0 | Anzahl geclaimter Dateien |
| `summary.new_files` | Integer | >= 0 | Anzahl neuer Dateien |
| `summary.modified_files` | Integer | >= 0 | Anzahl geaenderter Dateien |

### Schema Details: claims.json (Phase 4b)

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
| `session_id` | String | UUID v4 | Generiert beim Agent-Start |
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
| `summary.files_changed` | Integer | >= 0 | Anzahl geaenderter Dateien (Kopie aus claims) |
| `summary.entities_changed` | Integer | >= 0 | Anzahl geaenderter Entities (Kopie aus claims) |
| `summary.new_files` | Integer | >= 0 | Anzahl neuer Dateien (Kopie aus claims) |
| `summary.overlapping_files` | Integer | >= 0 | Dateien mit Overlap |
| `summary.overlapping_entities` | Integer | >= 0 | Entities mit Overlap |
| `summary.max_severity` | Enum | `none` / `low` / `high` | Hoechster Schweregrad |

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

## Agent Logic

> Sub-Agents statt Script. Conflict-Scanner Agent-Definition in `plugins/clemens/agents/conflict-scanner.md`.

### Agent Steps (Pre-Scan / Predict Mode)

```
1. Read: {spec_path}/slim-slices.md + {spec_path}/slices/*.md
2. Deliverables-Sektionen identifizieren, Dateipfade extrahieren
3. Pro Datei: Pruefen ob sie existiert (Glob) → action: "create" oder "modify"
4. Deduplizieren (mehrere Slices koennen gleiche Datei referenzieren)
5. Write: {spec_path}/predicted-claims.json
6. Bash: gh issue create --repo {repo} --title "Pipeline: {feature}" --label "pipeline:running" --body "{claims_json}"
7. Bash: gh issue list --repo {repo} --label "pipeline:running" --json number,title,body
8. Andere Sessions' Claims aus Issue-Body lesen (JSON-Bloecke)
9. File-Level Overlap berechnen (gleiche Datei = Overlap)
10. JSON-Output zurueckgeben: { status, has_overlap, issue_number, overlaps[], files_claimed, notes }
```

### Agent Steps (Post-Scan / Actual Mode)

```
1. Bash: git diff main...{branch} --stat --unified=0 -p
2. Diff-Output lesen: Dateien + Hunk Headers (@@-Zeilen) → Entity-Namen extrahieren
   - "function PromptArea()" → entity: "PromptArea", entity_type: "function"
   - "class UserService" → entity: "UserService", entity_type: "class"
   - Kein Match → entity_type: "unknown"
   - Neue Datei (alle Hunks +) → entity_type: "new_file"
3. Write: {spec_path}/claims.json (Entity-Level)
4. Bash: gh issue edit {issue_number} --repo {repo} --body "{actual_claims_json}"
5. Bash: gh issue list --repo {repo} --label "pipeline:running" --json number,title,body
6. Andere Sessions' Claims aus Issue-Body lesen (JSON-Bloecke)
7. Entity-Level Overlap berechnen:
   - Gleiche Datei + gleiche Entity → severity: "high"
   - Gleiche Datei + verschiedene Entity → severity: "low"
8. Write: {spec_path}/overlap-report.json
9. JSON-Output zurueckgeben: { status, has_overlap, overlaps[], summary, notes }
```

### Agent Tools

| Tool | Verwendung |
|------|-----------|
| Read | Spec-Dateien lesen (slim-slices.md, slices/*.md) |
| Glob | Datei-Existenz pruefen (create vs modify) |
| Grep | Deliverables-Sektionen finden |
| Bash | git diff, gh issue create/list/edit |
| Write | predicted-claims.json, claims.json, overlap-report.json |

### Overlap-Berechnung

```
Pre-Scan (File-Level):
  Gleiche Datei in eigenen + fremden Claims → Overlap

Post-Scan (Entity-Level):
  FOR each own_entity IN entities_changed:
    FOR each other_session IN other_sessions:
      FOR each their_entity IN other_session.entities_changed:
        IF own_entity.file == their_entity.file:
          IF own_entity.entity == their_entity.entity AND own_entity.entity != null:
            → overlap_type: "same_entity", severity: "high"
          ELSE:
            → overlap_type: "same_file_different_entity", severity: "low"
```

---

## Security

### Authentication & Authorization

| Area | Mechanism | Notes |
|------|-----------|-------|
| GitHub API | `gh` CLI with pre-configured auth (`gh auth login`) | Token stored by gh, nicht im Agent-Output |
| Repo Access | GitHub permissions des authentifizierten Users | Read/Write Issues Berechtigung noetig |
| Agent Execution | Lokal, keine Remote-Ausfuehrung | Laeuft als Sub-Agent im Orchestrator-Kontext |

### Data Protection

| Data Type | Protection | Notes |
|-----------|------------|-------|
| GitHub Token | Managed by `gh` CLI | Nicht im Agent-Output, nicht in Logs |
| File Paths | Relative Pfade in Issues | Keine absoluten Pfade exponieren |
| Code Content | Nicht in Issues | Nur Entity-Namen und Zeilen-Ranges, kein Source Code. Agent schreibt keinen Code in Issues |

### Input Validation & Sanitization

| Input | Validation | Sanitization |
|-------|------------|--------------|
| Agent Prompt Fields | Orchestrator validiert spec_path Existenz, repo Format | Agent prueft nochmal vor gh CLI Aufrufen |
| GitHub Issue Body (fremde) | Agent liest JSON-Bloecke defensiv | Unbekannte Felder ignorieren |
| Git diff Output | Agent liest Hunk Headers nativ | Nur erkannte Entity-Patterns verwenden |

### Rate Limiting & Abuse Prevention

| Resource | Limit | Notes |
|----------|-------|-------|
| GitHub API | 5000/h (authenticated) | Agent nutzt < 10 Calls pro Run |
| gh issue list | Max 100 Issues (--limit 100) | Genuegt fuer parallele Sessions |
| Agent Execution | Zweimal pro Pipeline-Run (Pre + Post) | Kein Retry-Loop im Agent |
| gh CLI Timeout | gh CLI nutzt Built-in HTTP-Timeouts (default: 30s pro Request) | Kein zusaetzlicher Timeout noetig. Bei Netzwerk-Ausfall: gh gibt Fehler zurueck, Agent reportet status=failed |

---

## Architecture Layers

### Layer Responsibilities

| Layer | Responsibility | Pattern |
|-------|----------------|---------|
| Orchestrator (Phase 0) | Worktree Setup, Pre-Scan Agent aufrufen, Advisory Warning bei Overlap | Pipeline Phase Pattern |
| Orchestrator (Phase 4b) | Post-Scan Agent aufrufen, JSON pruefen, Reporter bei Overlap, Label setzen | Pipeline Phase Pattern |
| Sub-Agent (`conflict-scanner`, Pre-Scan) | Spec-Deliverables lesen, Predicted Claims, Issue erstellen, File-Level Overlap | Fresh Context Sub-Agent Pattern |
| Sub-Agent (`conflict-scanner`, Post-Scan) | git diff + Entity-Extraktion, Actual Claims, Issue updaten, Entity-Level Overlap | Fresh Context Sub-Agent Pattern |
| Sub-Agent (`conflict-reporter`) | Overlap-Report lesen, menschenlesbare Comments schreiben | Fresh Context Sub-Agent Pattern |
| State (GitHub Issues) | Session-Registry, Cross-Machine Sichtbarkeit, Two-Phase Claims | Remote State Pattern |
| State (Lokale JSON) | predicted-claims.json, claims.json, overlap-report.json | File-based State Pattern |

### Data Flow

```
Orchestrator (Phase 0: Worktree Setup + Pre-Scan)
  │
  ├── Step 0a: Worktree Setup
  │     Bash("git worktree list") → pruefen ob Worktree existiert
  │     IF existiert: cd worktrees/{feature} && Bash("git rebase main")
  │     ELSE: Bash("git worktree add worktrees/{feature} -b feature/{feature}")
  │
  └── Step 0b: Task(conflict-scanner, mode=predict, spec_path=..., repo=...)
        │
        ├── Read: slim-slices.md       →  File-Level Claims aus Slice-Specs
        ├── Bash: gh issue create      →  Session Registry (neues Issue, predicted claims)
        ├── Bash: gh issue list        →  Andere Sessions lesen
        ├── Overlap Calculation        →  File-Level
        └── Write: predicted-claims.json → Lokale Datei
        Return: { has_overlap, issue_number, overlaps[] }

  [... Implementation (Phases 1-4) ...]

Orchestrator (Phase 4b: Post-Scan + Update)
  │
  ├── Step 1: Task(conflict-scanner, mode=actual, branch=..., spec_path=..., repo=..., issue_number=N)
  │     │
  │     ├── Bash: git diff            →  Entity Extraction (Hunk Headers nativ lesen)
  │     ├── Bash: gh issue edit       →  Body UPDATE (predicted → actual Claims)
  │     ├── Bash: gh issue list       →  Andere Sessions lesen
  │     ├── Overlap Calculation       →  Entity-Level
  │     ├── Write: claims.json        →  Lokale Datei
  │     └── Write: overlap-report.json → Lokale Datei
  │     Return: { has_overlap, overlaps[], summary }
  │
  ├── Step 2 (nur bei has_overlap=true):
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

**Phase 0 (Pre-Scan):**

| Error Type | Handling | Orchestrator Response | Logging |
|------------|----------|----------------------|---------|
| Agent: has_overlap=false | Kein Overlap | Weiter mit Implementation | Info: "Pre-scan clean, no overlaps" |
| Agent: has_overlap=true | Overlap gefunden | Advisory Warning ausgeben, WEITER mit Implementation | Warning: "⚠️ Pre-scan overlap: {summary}. Proceeding (advisory)." |
| Agent: status=failed | Fehler (gh/git) | Log Warning, weiter ohne Pre-Scan | Warning: "Pre-scan failed: {notes}" |
| Worktree existiert bereits | cd in existierenden Worktree | Weiter mit Rebase | Info: "Using existing worktree" |
| Worktree-Erstellung fehlschlaegt | Log Warning | Weiter ohne Worktree (auf aktuellem Branch) | Warning: "Worktree creation failed" |
| Rebase Conflict (existierender Worktree) | git rebase --abort | Warnung, weiter auf altem Stand | Warning: "Rebase failed, continuing on current base" |

**Phase 4b (Post-Scan):**

| Error Type | Handling | Orchestrator Response | Logging |
|------------|----------|----------------------|---------|
| Agent: has_overlap=false | Kein Overlap | Weiter zu Step 3 | Info: "No conflicts detected" |
| Agent: has_overlap=true | Overlap gefunden | Task(conflict-reporter), dann Step 3 | Info: "Overlaps found: {summary}" |
| Agent: status=failed | Fehler (gh/git) | Log Warning, weiter ohne Post-Scan | Warning: "Post-scan failed: {notes}" |
| gh nicht installiert | Agent erkennt und reportet | Skip Phase 0 + 4b | Warning |
| gh nicht authentifiziert | Agent erkennt und reportet | Skip Phase 0 + 4b | Warning |
| JSON Parse Error (fremdes Issue) | Skip diese Session | Andere Sessions weiter pruefen | Warning: "Skipping issue #{n}: invalid JSON" |
| Reporter Agent failed | Log, weiter | Label trotzdem setzen | Warning: "Reporter failed" |

---

## Migration Map

> Orchestrator Commands werden um Phase 0 (Worktree Setup + Pre-Scan), Phase 4b (Post-Scan) erweitert.

| Existing File | Current Pattern | Target Pattern | Specific Changes |
|---|---|---|---|
| `plugins/clemens/commands/orchestrate.md` | Phase 1 → ... → Phase 5 (Worktree in Phase 2, Script-basiertes Phase 4b) | Phase 0 → Phase 1 → ... → Phase 4 → Phase 4b → Phase 5 | **Phase 0 (NEU einfuegen vor Phase 1):** Worktree Setup (`git worktree list` → create oder rebase), Pre-Scan (`Task(conflict-scanner, mode=predict)`), Advisory Warning bei Overlap. **Phase 2 (REMOVE):** Existierende Worktree-Erstellung in Phase 2 ENTFERNEN (nach Phase 0 verschoben). **Phase 4b (REPLACE):** Existierenden Script-Aufruf (`Bash("node conflict-scanner.js")`) durch `Task(conflict-scanner, mode=actual)` ersetzen. Reporter-Agent-Aufruf und Label-Logik bleiben. **State (ERWEITERN):** `worktree_setup` + `pre_scan` als neue States (conflict_scan + conflict_report existieren bereits). Neue Felder: worktree_path, branch, issue_number. |
| `plugins/clemens/commands/slim-orchestrate.md` | Phase 1 → ... → Phase 5 | Phase 0 → Phase 1 → ... → Phase 4 → Phase 4b → Phase 5 | Identische Aenderungen wie orchestrate.md |
| `plugins/clemens/commands/conflict-scan.md` | `Bash("node scripts/conflict-scanner.js --branch ... --spec-path ... --repo ... --base ... --weave")` | `Task(conflict-scanner, mode=actual)` + `Task(conflict-reporter)` bei Overlap | Script-Aufruf durch Sub-Agent-Aufruf ersetzen. CLI-Argumente werden zu Task()-Prompt-Fields (branch, spec_path, repo, issue_number). `--base` und `--weave` Flags entfallen komplett (Agent nutzt git diff, kein Weave). Manueller Command unterstuetzt NUR Post-Scan (mode=actual), da Pre-Scan in den Orchestrator-Phase-0-Flow gehoert. Reporter-Agent wird bei Overlap aufgerufen (bestehendes Verhalten beibehalten). |
| `plugins/clemens/agents/conflict-scanner.md` | Existiert nicht | NEU ERSTELLEN | Neue Agent-Definition fuer Conflict-Scanner Sub-Agent. Zwei Modi (predict/actual), Tools: Read, Glob, Grep, Bash, Write. JSON-Output-Contract. |
| `plugins/clemens/scripts/conflict-scanner.js` | 1007 LOC Node.js Script | ENTFERNEN | Script wird durch conflict-scanner Sub-Agent ersetzt. |
| `plugins/clemens/scripts/conflict-scanner.test.js` | Test-Datei fuer Script | ENTFERNEN | Tests nicht mehr noetig — Script entfaellt. |
| `plugins/clemens/scripts/simulate-conflict-scanner.sh` | Simulations-Script | ENTFERNEN | Simulations-Script nicht mehr noetig — Agent ersetzt Script. |
| `plugins/clemens/agents/conflict-reporter.md` | Bestehende Agent-Definition mit Weave-Referenzen (weave_validation, auto_resolvable, conflict_entities, Weave-Empfehlungslogik) | Weave-Referenzen entfernen, neue Severity-Logik | Alle Weave-Referenzen entfernen. **Neue Empfehlungslogik:** severity "high" (gleiche Entity) → "Manueller Review empfohlen. Erst andere Session mergen, dann rebasen." severity "low" (gleiche Datei, verschiedene Entities) → "Wahrscheinlich konfliktfrei. git merge loest verschiedene Entities in gleicher Datei." weave_validation Block, confidence Feld, auto_resolvable Logik komplett entfernen. |

---

## Constraints & Integrations

### Constraints

| Constraint | Technical Implication | Solution |
|------------|----------------------|----------|
| Cross-Platform (Win/Mac/Linux) | Agent nutzt git/gh CLI die auf allen OS laufen | Keine eigenen Path-Operationen, CLI ist cross-platform |
| Zero eigener Code | Kein Script-Code zu warten | Agent-Definitionen (Markdown) + CLI-Tools |
| Plugin-Packaging | Agent-Definition muss im Plugin-Verzeichnis leben | `plugins/clemens/agents/conflict-scanner.md` |
| Non-blocking | Conflict Scan darf Pipeline nicht blocken | Agent-Failure = Warning, Pipeline geht weiter |
| JSON-Output-Contract | Orchestrator muss Agent-Output parsen koennen | Definiertes JSON-Schema im Agent-Prompt, parse_agent_json() Pattern |

### Integrations

| Area | System / Capability | Interface | Version | Notes |
|------|----------------------|-----------|---------|-------|
| Entity Extraction (Primary) | Git | `git diff main...{branch}` Hunk Headers | Git 2.x (pre-installed) | Funcname-Patterns aus .gitattributes oder Built-in |
| Session Registry | GitHub Issues API | `gh` CLI (create, list, edit, comment) | gh >=2.0.0 (tested: v2.81.0) | Remote State, Cross-Machine |
| Sub-Agent Execution | Claude Code Task() | `subagent_type: "conflict-scanner"` / `"conflict-reporter"` | Plugin v1.2.0+ | Fresh Context Pattern |
| Worktree Isolation | Git Worktrees | `git worktree add` | Git 2.x | Separater Working Tree + Branch |
| Conflict Memory | git rerere | `git config rerere.enabled true` | Git 2.x | Remembered resolutions |

---

## Quality Attributes (NFRs)

### From Discovery → Technical Solution

| Attribute | Target | Technical Approach | Measure / Verify |
|-----------|--------|--------------------|------------------|
| Cross-Platform | Windows + Mac + Linux | Sub-Agent nutzt git/gh CLI (cross-platform), keine eigenen Path-Operationen | Test auf Win + Mac |
| Cost Efficiency | ~$0.10-0.20 pro Pipeline-Run | Scanner-Agent ~$0.05-0.10 pro Aufruf x 2 (Pre+Post). Reporter nur bei Overlap (~2%) | Track ueber Issues |
| Maintainability | Zero eigener Code | Agent-Definitionen sind Markdown, kein Script-Code zu warten | Agent-Prompt Review |
| Performance | Conflict Scan < 60s total | Agent < 30s pro Aufruf (git diff + gh API + LLM). Pre-Scan + Post-Scan insgesamt < 60s | Zeitmessung in Orchestrator |
| Reliability | Kein Pipeline-Blocker | Agent-Failure = Warning, Pipeline geht weiter. JSON-Parse-Fehler = Warning, weiter | E2E Test: gh offline → Agent reports failure → Pipeline completes |

### Monitoring & Observability

| Metric | Type | Target | Method |
|--------|------|--------|--------|
| Agent has_overlap | Counter | Meiste false, wenige true | GitHub Issue Labels (running/merge-ready) |
| Overlap Count | Gauge | < 5% der Runs | overlap-report.json summary |
| Entity Accuracy | Manual | Hunk-Header Entity-Namen stimmen | Stichproben-Review |

---

## Risks & Assumptions

### Assumptions

| Assumption | Technical Validation | Impact if Wrong |
|------------|---------------------|-----------------|
| `gh` CLI ist installiert und authentifiziert | `gh auth status` Check im Agent via Bash | Agent reportet status=failed, Pipeline weiter ohne Conflict Scan |
| Git Hunk Headers liefern brauchbare Entity-Namen | Git funcname Patterns fuer gaengige Sprachen | Entity-Name "unknown", Overlap-Erkennung nur auf File-Level |
| GitHub Issues Body < 65536 chars | Claims JSON fuer typische Features ~2-5 KB | Large-Feature: Claims kuerzen (nur Top-50 Entities) |
| Andere Sessions schreiben korrektes JSON im Issue Body | Agent liest JSON defensiv, skipped korrupte Issues | Skip korrupte Issues, log Warning |
| Maximal ~20 parallele Sessions | `gh issue list --limit 100` reicht | Erhoehen auf --limit 500 |
| Feature-Branch heisst `feature/*` | Convention im Team | Argument --branch erlaubt beliebige Branch-Namen |
| Slice-Specs enthalten Deliverables mit Dateipfaden | Agent liest Markdown-Deliverables nativ | Predicted Claims leer, Pre-Scan liefert keine Warnung |
| Worktree-Erstellung funktioniert | `git worktree add`, Fallback: weiter ohne Worktree | Warning, Pipeline laeuft auf aktuellem Branch weiter |
| Rebase auf main ist moeglich (bei existierendem Worktree) | `git rebase main`, bei Conflict: `git rebase --abort` | Warning, Pipeline laeuft auf altem Stand weiter |

### Risks & Mitigation

| Risk | Likelihood | Impact | Technical Mitigation | Fallback |
|------|------------|--------|---------------------|----------|
| GitHub API Rate Limit | Low | Medium | < 15 API Calls pro Run (2 Phasen), Authenticated (5000/h) | Agent kann Fehler erkennen und reportieren |
| Hunk Header ohne Entity-Name | Medium | Low | Agent erkennt "unknown" Pattern, Fallback auf File-Level | Overlap nur auf File-Level |
| Fremdes Issue hat kaputtes JSON | Low | Low | Agent liest JSON defensiv, skipped korrupte Issues | Warnung im Output, andere Sessions weiter pruefen |
| Git Worktree Cleanup vergessen | Low | Medium | Worktree-Liste in State, Cleanup in Phase 5 | `git worktree prune` manuell |
| Agent-Output nicht parsebar | Low | Medium | JSON-Output-Contract im Agent-Prompt definiert, parse_agent_json() Pattern | Orchestrator behandelt Parse-Fehler als Warning, Pipeline weiter |
| Predicted Claims unvollstaendig | High | Low | Post-Scan (actual) faengt alles auf | Pre-Scan ist Bonus, nicht Pflicht |
| Worktree-Erstellung fehlschlaegt | Low | Low | Weiter ohne Worktree auf aktuellem Branch | Warning, kein Block |
| Rebase Conflict (existierender Worktree) | Medium | Low | `git rebase --abort`, Pipeline laeuft auf altem Stand | Warning, kein Block |
| Stale Issues (abandoned Sessions) | Medium | Medium | Issue-Alter pruefen (> 24h + kein Commit = stale Warning) | Manueller Override, Label-Cleanup |
| Race Condition (gleichzeitige Issue-Erstellung) | Low | Low | Double-Check: nach gh issue create nochmal gh issue list | Post-Scan faengt es spaeter |

---

## Technology Decisions

### Stack Choices

| Area | Technology | Rationale |
|------|------------|-----------|
| Conflict Scanning | Sub-Agent (conflict-scanner) | LLM liest Markdown/Diffs nativ, kein Regex-Code, zero Wartung. Agent-Kosten (~$0.05-0.10/Run) vernachlaessigbar |
| Entity Extraction | Agent liest git diff Hunk Headers nativ | LLM versteht Diff-Output ohne Parser, erkennt Entity-Patterns in jeder Sprache |
| Session Registry | GitHub Issues | Remote State, Cross-Machine, PM-sichtbar, `gh` CLI, keine extra Infrastruktur |
| Sub-Agent Execution | Claude Code Task() | Fresh Context Pattern, JSON output contract, bestehende Orchestrator-Integration |
| Conflict Memory | git rerere | Built-in, records + replays merge resolutions |

### Trade-offs

| Decision | Pro | Con | Mitigation |
|----------|-----|-----|------------|
| Sub-Agent statt Script | Zero eigener Code, LLM liest Markdown/Diffs nativ, keine Regex-Bugs | ~$0.05-0.10 API-Kosten pro Scan-Run | Kosten vernachlaessigbar bei wenigen Runs/Tag |
| GitHub Issues als Remote State | Cross-Machine, PM-sichtbar, keine extra Infrastruktur | Nicht Echtzeit, API-Latenz | Ausreichend fuer Pre/Post-Implementation Scan |
| Reporter-Agent nur bei Post-Scan Overlap | Reduziert API-Kosten auf ~2% der Runs | Kein menschenlesbarer Comment bei kein Overlap | Issue-Titel + Labels genuegen bei kein Overlap |
| Non-blocking Conflict Scan | Pipeline nie blockiert | Konflikte werden nur gemeldet, nicht verhindert | Bewusste Entscheidung: Erkennung > Praevention im MVP |
| Two-Phase Claims (predict + actual) | Fruehwarnung VOR Implementation, Wahrheit NACH Implementation | Zwei Agent-Aufrufe statt einem, predicted Claims sind unvollstaendig | Post-Scan faengt alles auf was Pre-Scan verpasst |
| Advisory statt Blocking Pre-Scan | Kein Deadlock bei abandoned Sessions | Overlap kann ignoriert werden | Dev-Entscheidung, Post-Scan als Sicherheitsnetz |
| Worktree + Rebase statt nur Rebase | Neuer Worktree = implizit auf latest main. Existierender Worktree wird rebaset. Agent prueft automatisch | Worktree-Erstellung kann fehlschlagen, Rebase kann Konflikte haben | Worktree-Failure = Warning, weiter auf aktuellem Branch. Rebase-Failure = abort, weiter auf altem Stand |

---

## Open Questions

| # | Question | Options | Recommended | Decision |
|---|----------|---------|-------------|----------|
| — | Keine offenen Fragen | — | — | Alle Entscheidungen getroffen |

---

## Context & Research

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
| 2026-03-09 | Codebase | Plugin: 21 agents, 13 commands, templates/. Neue Agents statt scripts/ |
| 2026-03-09 | Codebase | Kein .gitattributes, kein Weave-Setup bisher |
| 2026-03-12 | Analyse | REVIDIERT: Sub-Agent statt Node.js Script. LLM liest Markdown/Diffs nativ, kein ~400 LOC Regex-Code. Agent-Kosten (~$0.05-0.10/Run) vernachlaessigbar vs. Wartungskosten |
| 2026-03-09 | Web | Git diff funcname: Built-in Patterns fuer 10+ Sprachen, Custom via .gitattributes |

---

## Q&A Log

| # | Question | Answer |
|---|----------|--------|
| 1 | Architecture-Tiefe: Wie tief soll die Architecture gehen? (Kurz / Standard / Detailliert) | Standard: Script-Architektur, Agent-Definition, Orchestrator-Integration, Error Handling, Security. Kein Code. |
| 2 | Entity-Extraktion: Welche Methode? | git diff Hunk-Header-Parsing als einzige Methode. Sub-Agent liest Diff-Output nativ. Weave wurde evaluiert und verworfen (zusaetzliche Dependency ohne signifikanten Mehrwert). |
| 3 | Pre-Scan blocking oder advisory? | Advisory: Warnt bei Overlap, blockiert nicht. Verhindert Deadlocks bei abandoned Sessions. Szenario-Analyse: Blocking fuehrt zu Deadlock wenn Session abandoned wird ohne Issue-Cleanup. |
| 4 | Two-Phase Claims: Warum nicht nur Pre-Scan? | Predicted Claims aus Spec-Deliverables sind File-Level und unvollstaendig (Implementation kann unvorhergesehene Dateien aendern). Post-Scan mit git diff ist die Entity-Level Wahrheit. |
| 5 | Wann Issue erstellen: Phase 0 oder Phase 4b? | Phase 0 (predict): Issue erstellen mit predicted Claims. Phase 4b (actual): Issue Body updaten mit echten Claims. Fruehe Sichtbarkeit + spaetere Akkuratesse. |
| 6 | Worktree + Rebase: Wie funktioniert Phase 0 Step 0a? | Agent prueft `git worktree list`. Neuer Worktree: `git worktree add` (brancht von latest main, implizit rebased). Existierender Worktree: `git rebase main` (catch up). Rebase-Failure: `git rebase --abort`, Warning, weiter auf altem Stand. Worktree-Failure: Warning, weiter ohne Worktree. |
| 7 | Script oder Sub-Agent fuer Conflict-Scanning? | Sub-Agent: LLM liest Markdown (Spec-Deliverables) und git diff (Hunk Headers) nativ — kein Regex-Code noetig. Script haette ~400 LOC mit fragilen Parsern. Bisherige Script-Bugs (ENOBUFS, base-branch) bestaetigen Wartungsaufwand. Agent-Kosten (~$0.05-0.10/Run) vernachlaessigbar. |
