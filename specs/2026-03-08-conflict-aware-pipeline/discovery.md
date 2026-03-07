# Feature: Conflict-Aware Agent Pipeline

**Epic:** Pipeline Externalization & Multi-Session Coordination
**Status:** Ready
**Wireframes:** -- (tooling feature, no UI)

---

## Problem & Solution

**Problem:**
- Mehrere Pipeline-Sessions (gleicher Dev, Multi-Session ODER verschiedene Devs) arbeiten parallel am selben Repo
- Jede Session plant und implementiert Aenderungen an Dateien ohne zu wissen, dass andere Sessions die gleichen Dateien anfassen
- Merge-Konflikte entstehen erst beim Merge und muessen manuell geloest werden
- Pipeline stoppt bei Konflikten, Orchestrator kann nicht autonom durchlaufen
- Kein externer State: Session-Info, Claims, Progress existieren nur lokal im Repo

**Solution:**
- Worktree-Isolation: Jeder Orchestrator laeuft auf eigenem Branch/Worktree
- Weave als Git merge driver: Entity-Level Merge loest ~98% der Konflikte automatisch (verschiedene Funktionen in gleicher Datei = kein Konflikt)
- GitHub-basierte Session-Registry + File-Claims: Jede Session registriert sich und ihre betroffenen Dateien als GitHub Issue
- Conflict-Checker Agent: Prueft File-Overlap mit anderen Sessions, benachrichtigt betroffene Devs via @mention
- Merge Queue: Sequentielles Mergen (FCFS + Manual Override) mit automatischem Rebase

**Business Value:**
- Pipeline laeuft autonom durch, auch bei paralleler Entwicklung
- Konflikte werden frueh erkannt (nach Architecture) statt spaet (beim Merge)
- Multi-Dev-Faehigkeit: Mehrere Entwickler koennen die Pipeline gleichzeitig am selben Repo nutzen
- Zero extra Infrastruktur (GitHub API + Git Tools, kein Server/DB noetig)

---

## Scope & Boundaries

| In Scope |
|----------|
| Worktree-Isolation: Orchestrator erstellt automatisch Worktree + Branch bei Start |
| Weave Integration: `.gitattributes` Config + Setup-Anleitung fuer Ziel-Repos |
| `git rerere` Aktivierung fuer wiederkehrende Conflict-Patterns |
| GitHub Session-Registry: Issue pro Pipeline-Run mit Session-ID, Feature, Branch, Status |
| GitHub File-Claims: Betroffene Dateien mit Beschreibung werden im Issue geloggt |
| Conflict-Checker Agent (3 Modi: `register`, `check`, `update`) |
| Architecture-Agent Integration: Claims registrieren nach Gate 1 Approval |
| Orchestrator Integration: Conflict-Check vor jedem Slice, Claims-Update nach jedem Slice |
| Merge Queue: Label-basiert (`merge-ready`), FCFS-Reihenfolge mit Manual Override |
| Merge-Agent: Sequentielles Mergen mit Weave + Tests + Label-Update |
| Conflict-Notification: Comment im eigenen + betroffenen Issue mit @mention |
| Single-User Duplikat-Vermeidung: Immer beide Issues kommentieren, keine Sonderlogik |

| Out of Scope |
|--------------|
| LLM-basierte Konfliktloesung (Rizzler / Ebene 3) |
| Re-Implementation bei unloessbaren Konflikten (Gas Town Refinery / Ebene 4) |
| Dependency-Aware Merge-Reihenfolge |
| Entity-Level Claims (Weave MCP Server, Funktions-Granularitaet) |
| Dashboard / Echtzeit-Monitoring |
| Automatisches Rebase bei laufenden Sessions |
| Slack/Email Notifications (nur GitHub @mention) |

---

## Current State Reference

> Existing functionality that will be reused (unchanged).

- Architecture-Agent: Erstellt `architecture.md` mit "Existing Files Modified" + "New Files" Tabellen (exakte Dateipfade + Aenderungsbeschreibung)
- Architecture Compliance Gate (Gate 1): Validiert Architecture gegen Discovery
- Orchestrator: Wave-based Implementation mit 6-Step Pipeline (Implementer -> Reviewer -> Lint -> Test-Writer -> Validator -> Debugger)
- Orchestrator State: `.orchestrator-state.json` im Spec-Pfad
- Orchestrator Evidence: `.claude/evidence/{feature}/` im Repo
- Gate-Log: `{spec_path}/gate-log.jsonl` (append-only)
- Sub-Agent Pattern: Orchestrator nutzt `Task()` fuer alle Sub-Agents mit JSON-Parsing
- Claude Code Worktree-Support: `claude --worktree` und `isolation: worktree` fuer Sub-Agents

---

## Architecture (Pipeline-Integration)

### Conflict-Resolution Schichten-Modell

| Ebene | Mechanismus | Loest | Kosten | MVP |
|-------|-------------|-------|--------|-----|
| 1: Vermeidung | Worktrees + Task-Dekomposition | ~90% (kein File-Overlap) | Nichts | Ja |
| 2: Semantic Merge | Weave als Git merge driver | ~8% (verschiedene Entities in gleicher Datei) | Nichts (lokal) | Ja |
| 3: LLM Merge | Rizzler oder Custom-Agent | ~1.5% (gleiche Entity beidseitig geaendert) | API-Calls | Nein (V2) |
| 4: Re-Implementation | Gas Town Refinery Pattern | ~0.4% (Intent extrahieren, neu implementieren) | Volle Impl | Nein (V2) |
| 5: Eskalation | GitHub Issue mit Merge-Anleitung | ~0.1% (unloesbarer Konflikt) | Manuell | Nein (V2) |

### Conflict-Checker Agent

**Eigenstaendiger Agent, wird via `Task()` aufgerufen. Schont den Orchestrator-Context.**

| Modus | Aufrufer | Zeitpunkt | Input | Output | Side-Effect |
|-------|---------|-----------|-------|--------|-------------|
| `register` | Architecture Flow | Nach Gate 1 Approval | Architecture "Existing Files Modified" + "New Files" | `{ issue_number, conflicts: [...] }` | GitHub Issue erstellen, Claims schreiben, initialen Overlap pruefen |
| `check` | Orchestrator | Vor jedem Slice-Implementer (Step 0) | Slice-Spec Files, eigene Issue-Nummer | `{ conflicts: [...], status: "ok" \| "warning" }` | Warning-Comment ins eigene + betroffene Issues |
| `update` | Orchestrator | Nach jedem Slice-Implementer (Step 6b) | `impl_json.files_changed`, eigene Issue-Nummer | `{ updated: true }` | Claims im Issue aktualisieren |

### GitHub Issue Schema

**Ein Issue pro Pipeline-Run:**

Title: `Pipeline: {feature-name}`
Labels: `running` | `merge-ready` | `merged` | `merge-failed`
Assignee: Dev der die Pipeline gestartet hat

Body (Frontmatter + Claims):

```
---
session_id: {uuid}
feature: {feature-name}
branch: feature/{feature-name}
spec_path: specs/phase-{n}/YYYY-MM-DD-{name}/
started_at: {ISO timestamp}
---

## File Claims

### Existing Files Modified
- `components/workspace/prompt-area.tsx`: Replace Select with Card Trigger
- `app/actions/generations.ts`: Add bulk move/delete actions

### New Files
- `lib/aspect-ratio.ts`: Ratio/size calculation utils
- `components/compare/compare-modal.tsx`: Compare view modal
```

### Issue Comments (append-only Pipeline Log)

```
### Phase: Architecture Complete
Timestamp: {ISO}
Claims registered: {N} existing, {M} new files

### Slice {id}: Starting
Files: [{file-list}]

### Conflict Detected
Files: [`prompt-area.tsx`]
Overlaps with: #{issue} ({feature}, @{user})

### Slice {id}: Complete
Commit: {hash}
Files changed: [{actual-file-list}]

### Pipeline Complete
Status: merge-ready
Total slices: {N}
Total conflicts detected: {N}
```

### Conflict-Notification Format

**Multi-Dev (verschiedene Autoren):**

Kommentar in beiden Issues:

```
Conflict detected: `prompt-area.tsx`
  This session: {beschreibung}
  Other session: #{issue} ({feature}, @{user}): {beschreibung}
```

**Single-User (gleicher Autor):**

Gleicher Kommentar in beiden Issues (keine Sonderlogik, doppelte Notification akzeptabel im MVP).

### Merge Queue Flow

```
1. Orchestrator fertig (alle Slices + Final Validation)
   -> Label: "running" -> "merge-ready"
   -> Comment: "Pipeline Complete, ready to merge"

2. Merge-Agent pollt Issues mit Label "merge-ready" (FCFS nach Timestamp)
   -> Nimmt aeltestes Issue
   -> git checkout main && git pull
   -> git merge feature/{name} (Weave loest automatisch)
   -> Tests laufen
   -> Wenn gruen: merge to main, Label -> "merged"
   -> Wenn rot: Label -> "merge-failed", Comment mit Error
   -> Naechstes Issue: git rebase main, dann merge

3. Manual Override: Dev kann Label manuell setzen um Reihenfolge zu aendern
```

### Weave Integration

```
# .gitattributes (im Ziel-Repo)
*.ts merge=weave
*.tsx merge=weave
*.js merge=weave
*.jsx merge=weave
*.py merge=weave
*.php merge=weave
*.go merge=weave
*.rs merge=weave

# Git Config (einmalig pro Rechner)
git config merge.weave.driver "weave merge %O %A %B"
git config --global rerere.enabled true
```

Weave parst Code via Tree-Sitter in semantische Entities (Funktionen, Klassen). Zwei Branches die verschiedene Funktionen in der gleichen Datei aendern erzeugen keinen Konflikt. Nur Aenderungen an der gleichen Entity erzeugen einen echten Konflikt.

---

## Pipeline Integration Points

### Architecture Flow (erweitert)

```
Architecture-Agent -> Architecture erstellt
  -> Gate 1 (Architecture Compliance) -> ggf. Retries
  -> APPROVED
  -> Task(conflict-checker, mode: "register")      <- NEU
    -> Erstellt GitHub Issue
    -> Extrahiert Claims aus Architecture
    -> Prueft sofort auf Overlap mit bestehenden Issues
    -> Gibt Ergebnis zurueck (Conflicts oder OK)
```

### Orchestrator Flow (erweitert)

```
FOR each slice IN wave:
    Step 0: Task(conflict-checker, mode: "check")   <- NEU
      -> Input: Slice-Spec Files, eigene Issue-Nummer
      -> Output: { conflicts, status }
      -> Bei Warning: Pipeline laeuft weiter (Weave loest beim Merge)

    Step 1: Task(slice-implementer)                  <- unveraendert
    Step 2: Task(code-reviewer)                      <- unveraendert
    Step 3: Deterministic Gate                        <- unveraendert
    Step 4: Task(test-writer)                        <- unveraendert
    Step 5: Task(test-validator)                     <- unveraendert
    Step 6: Retry Loop                               <- unveraendert

    Step 6b: Task(conflict-checker, mode: "update")  <- NEU
      -> Input: impl_json.files_changed, eigene Issue-Nummer
      -> Output: { updated: true }

Phase 4b (nach Final Validation):                    <- NEU
  -> Label: "running" -> "merge-ready"
  -> Comment: Pipeline Complete
```

---

## Business Rules

- Jede Pipeline-Session MUSS ein GitHub Issue erstellen (nach Architecture Gate 1)
- Claims werden aus der Architecture "Existing Files Modified" + "New Files" Tabelle extrahiert
- Claims enthalten Dateipfad + Aenderungsbeschreibung (aus Architecture)
- Conflict-Check ist non-blocking: Pipeline laeuft bei Warning weiter
- Conflict-Comments werden in beide betroffenen Issues geschrieben (mit @mention)
- Merge-Reihenfolge: FCFS nach Issue-Erstellungs-Timestamp
- Manual Override: Dev kann Merge-Reihenfolge durch manuelles Label-Setzen aendern
- Weave laeuft automatisch bei jedem `git merge` / `git rebase` (Git merge driver)
- `git rerere` merkt sich geloeste Konflikte und wendet sie automatisch bei Wiederholung an
- GitHub `gh` CLI muss installiert und authentifiziert sein (Voraussetzung)
- Ein Issue pro Pipeline-Run, nicht pro Slice oder pro Dev

---

## Data

### GitHub Issue Frontmatter

| Field | Required | Validation | Notes |
|-------|----------|------------|-------|
| `session_id` | Yes | UUID v4 | Eindeutige Session-ID, generiert bei Pipeline-Start |
| `feature` | Yes | Non-empty string | Feature-Name aus Spec-Pfad |
| `branch` | Yes | Valid git branch name | `feature/{feature-name}` |
| `spec_path` | Yes | Valid path | Pfad zur Spec im Repo |
| `started_at` | Yes | ISO 8601 timestamp | Zeitpunkt des Pipeline-Starts |

### File Claim Entry

| Field | Required | Validation | Notes |
|-------|----------|------------|-------|
| `file_path` | Yes | Valid relative path | Relativer Pfad zur Datei im Repo |
| `description` | Yes | Non-empty string | Was an der Datei geaendert wird |
| `type` | Yes | `existing` oder `new` | Existierende oder neue Datei |

### Conflict-Checker Output (JSON)

| Field | Required | Validation | Notes |
|-------|----------|------------|-------|
| `status` | Yes | `ok` oder `warning` | Ob Konflikte gefunden wurden |
| `conflicts` | Yes | Array | Liste der gefundenen Konflikte |
| `conflicts[].file` | Yes | String | Dateipfad |
| `conflicts[].other_issue` | Yes | Integer | GitHub Issue-Nummer der anderen Session |
| `conflicts[].other_feature` | Yes | String | Feature-Name der anderen Session |
| `conflicts[].other_user` | Yes | String | GitHub-Username des anderen Devs |
| `conflicts[].other_description` | Yes | String | Was die andere Session an der Datei aendert |
| `issue_number` | Yes (register) | Integer | Erstellte/verwendete Issue-Nummer |

---

## Trigger Inventory

| Trigger | Source | Pipeline | Result |
|---------|--------|----------|--------|
| Architecture Gate 1 APPROVED | Architecture Flow | Task(conflict-checker, register) | GitHub Issue erstellt, Claims geschrieben, initialer Overlap geprueft |
| Orchestrator startet Slice | Orchestrator Step 0 | Task(conflict-checker, check) | Re-Check Claims, Warning bei Overlap |
| Slice-Implementer fertig | Orchestrator Step 6b | Task(conflict-checker, update) | Claims aktualisiert mit tatsaechlichen Files |
| Final Validation bestanden | Orchestrator Phase 4b | Label-Update | Issue Label: `merge-ready` |
| Merge-Agent pollt | Merge-Agent | git merge + Tests | Label: `merged` oder `merge-failed` |
| Dev setzt Label manuell | GitHub UI | Merge-Reihenfolge Override | Naechster Merge-Kandidat aendert sich |

---

## Implementation Slices

### Dependencies

```
Slice 1 (Setup + gh Helpers) -> Slice 2 (Conflict-Checker Agent)
                              -> Slice 3 (Architecture Integration)
                                          |
                              Slice 4 (Orchestrator Integration) <- haengt von 2 + 3 ab
                                          |
                              Slice 5 (Merge-Queue Agent)
```

### Slices

| # | Name | Scope | Testability | Dependencies |
|---|------|-------|-------------|--------------|
| 1 | Setup + gh Helpers | Weave `.gitattributes` Template-Datei, Shell-Helper-Funktionen fuer `gh issue create`, `gh issue comment`, `gh issue edit`, `gh issue list --label`, `git rerere` Config-Anleitung | Test: gh-Befehle ausfuehren, Issue erstellen/kommentieren, `.gitattributes` valide | -- |
| 2 | Conflict-Checker Agent | Neuer Agent mit 3 Modi (`register`, `check`, `update`). Liest Claims anderer Issues via `gh issue list + gh issue view`, berechnet File-Overlap, schreibt Comments mit @mention. Output als JSON. | Test: Mock-Issues mit ueberlappenden Claims, verify JSON-Output, verify Comment-Format | Slice 1 |
| 3 | Architecture Integration | Architecture-Agent erweitern: nach Gate 1 Approval -> `Task(conflict-checker, mode: register)`. Extrahiert "Existing Files Modified" + "New Files" aus Architecture-Dokument via Regex/Parsing. | Test: Architecture-Doc mit Files -> Issue erstellt, Claims korrekt | Slice 1 |
| 4 | Orchestrator Integration | Step 0 (vor Slice-Implementer): `Task(conflict-checker, mode: check)`. Step 6b (nach Slice): `Task(conflict-checker, mode: update)`. Phase 4b: Label -> `merge-ready`. JSON-Parsing wie bei anderen Sub-Agents. | Test: Orchestrator ruft Conflict-Checker auf, parsed JSON, loggt Warnings, aktualisiert Claims | Slice 2, 3 |
| 5 | Merge-Queue Agent | Neuer Agent oder GitHub Action: Pollt Issues mit Label `merge-ready` (FCFS nach Timestamp), `git merge main` (Weave loest), Tests laufen, Label-Update (`merged`/`merge-failed`), naechste Session benachrichtigen | Test: 2 merge-ready Issues, sequentiell mergen, Weave-Resolution verifizieren, Label-Updates | Slice 4 |

### Recommended Order

1. **Slice 1:** Setup + gh Helpers -- Grundlage fuer alle weiteren Slices, definiert die GitHub-Interaktions-Patterns
2. **Slice 2:** Conflict-Checker Agent -- Kern-Agent, wird von Architecture und Orchestrator genutzt
3. **Slice 3:** Architecture Integration -- Fruehester Conflict-Detection-Punkt in der Pipeline
4. **Slice 4:** Orchestrator Integration -- Laufzeit-Checks waehrend der Implementierung
5. **Slice 5:** Merge-Queue Agent -- Automatisches Mergen nach Pipeline-Ende

---

## Context & Research

### SOTA Agent Pipeline Frameworks

| Framework | Ansatz | Relevanz |
|-----------|--------|----------|
| Gas Town (Steve Yegge) | Hierarchische Agents (Mayor/Polecats/Refinery), Git-backed JSONL State ("Beads"), automatische Merge-Resolution | Refinery-Pattern als V2-Referenz, Beads-Pattern fuer State-Persistenz |
| Claude Code Agent Teams (Anthropic) | Eingebaute Multi-Agent-Koordination, Shared Task List, File Locking, Mailbox-System | Referenz fuer Task-Claiming und File-Locking Patterns |
| Weave (Ataraxy Labs) | Tree-Sitter basierter Entity-Level Merge, 100% Benchmark (31/31 vs Git 15/31), MCP Server | Kern-Tool fuer automatische Merge-Resolution |
| GitButler | Virtuelle Branches im selben Working Directory, Claude Code Lifecycle Hooks | Alternative zu Worktrees (V2) |
| Multiclaude | "Brownian Ratchet" -- CI als Arbiter, nur vorwaerts, Fehler akzeptiert | Merge-Queue-Inspiration |

### Conflict-Resolution Tools

| Tool | Ansatz | Erfolgsrate |
|------|--------|-------------|
| Weave | Entity-Level Merge via Tree-Sitter | 100% (31/31 Benchmark) |
| Mergiraf | AST-Knoten Merge, 33 Sprachen | 83% (26/31 Benchmark) |
| Rizzler | LLM-basierter Git merge driver | Nicht quantifiziert |
| git rerere | Wiederverwendung bekannter Conflict-Resolutions | N/A (ergaenzend) |
| MergeBERT (Microsoft) | Transformer-basierte Klassifikation | 64-69% Precision |

### Bekannte Probleme bei parallelen Claude Code Sessions

| Problem | Quelle | Relevanz |
|---------|--------|----------|
| `.claude.json` Corruption auf Windows | GitHub Issues #28898, #29004, #29155 | Bekannt, aber separates Problem |
| File Cache Conflicts bei Worktrees | GitHub Issue #17531 | Betrifft Sub-Agents mit Worktree-Isolation |
| Cross-Session Message Contamination | GitHub Issue #30348 | Bekannt, separates Problem |
| Inter-Session Communication fehlt | GitHub Issue #24798 | Unser Feature loest dies teilweise via GitHub |

---

## Open Questions

| # | Question | Options | Recommended | Decision |
|---|----------|---------|-------------|----------|
| -- | Alle Fragen geklaert | -- | -- | -- |

---

## Research Log

| Date | Area | Finding |
|------|------|---------|
| 2026-03-07 | Web | Gas Town: 20-30 parallele Agents, Git-backed JSONL State ("Beads"), Refinery-Agent fuer automatische Merge-Resolution |
| 2026-03-07 | Web | Weave: Entity-Level Merge, 100% Benchmark (31/31), Tree-Sitter basiert, MCP Server fuer Agent-Koordination |
| 2026-03-07 | Web | Claude Code Agent Teams: Shared Task List, File Locking, Mailbox-System (experimentell, Opus 4.6) |
| 2026-03-07 | Web | Merge Queue Pattern: GitHub native, Graphite, Aviator -- sequentielles Mergen verhindert Konflikte |
| 2026-03-07 | Web | Multiclaude: "Brownian Ratchet" -- CI als Arbiter, nur vorwaerts, Fehler akzeptiert |
| 2026-03-07 | Web | CodeCRDT: Lock-free Koordination via CRDTs, optimistisches Write-Verify-Protokoll |
| 2026-03-07 | Web | Rizzler: LLM-basierter Git merge driver, Multi-Provider-Fallback, Disk-Cache |
| 2026-03-07 | Web | git rerere: Eingebaute Wiederverwendung von Conflict-Resolutions, zero Kosten |
| 2026-03-07 | Codebase | Architecture-Docs enthalten "Existing Files Modified" + "New Files" Tabellen mit exakten Pfaden + Beschreibungen |
| 2026-03-07 | Codebase | Orchestrator State (.orchestrator-state.json) liegt in-repo im Spec-Pfad |
| 2026-03-07 | Codebase | Evidence liegt in .claude/evidence/{feature}/ im Repo |
| 2026-03-07 | Codebase | 3 parallele Features in aifactory/specs/phase-2 (gleicher Tag) mit ueberlappenden Dateien (prompt-area.tsx in allen 3) |

---

## Q&A Log

| # | Frage | Antwort |
|---|-------|---------|
| 1 | Soll ich erst die essenziellen Fragen beantworten oder erst eine umfassende Recherche durchfuehren? | Ausfuehrliche Recherche zu SOTA Agent Pipelines, besonders Gas Town |
| 2 | Was ist das primaere Szenario fuer Parallelitaet? | Beides: Solo-Dev Multi-Session UND Multi-Dev ein Repo |
| 3 | Willst du die Scope-Fragen jetzt beantworten oder tiefer in bestimmte Konzepte eintauchen? | Scope-Fragen klaeren, Konzepte dabei kurz erklaeren. Inkrementell vorgehen, wichtigstes zuerst |
| 4 | Welches Backend fuer den External State Store? | GitHub API: Issues/Labels/Comments. Zero Infra, jeder Dev hat Zugang |
| 5 | Was ist der wichtigste Vorschlag, was ist unverzichtbar vs. nice-to-have? | File-Claim-Registry (P0), Session-Registry (P0), T1-Check nach Architecture (P1). Merge Queue und Pipeline-Log sind P2/P3 |
| 6 | Ist das Schichten-Modell die richtige Denkweise? Welche Ebenen im MVP? | Richtung sinnvoll. Aber: automatische Loesung statt Warning an User. Orchestrator soll durchlaufen koennen |
| 7 | Was ist Weave, wie funktioniert es? | Entity-Level Merge via Tree-Sitter. Verschiedene Funktionen in gleicher Datei = kein Konflikt. Git merge driver, laeuft automatisch |
| 8 | Warum Worktrees statt Branches? | Worktrees = eigenes Dateisystem pro Branch. Agent braucht stabiles FS das sich nicht unter ihm aendert |
| 9 | Welche Merge-Reihenfolge-Strategie? | FCFS + Manual Override. Einfach, 90% ausreichend. Dependency-Aware als V2 |
| 10 | An welchem Pipeline-Step Devs informieren? Architecture oder Planner? | Architecture: dort stehen erstmals exakte Dateipfade ("Existing Files Modified" + "New Files" Tabellen) |
| 11 | Orchestrator oder Planner? Muessen Files definitiv feststehen? | Architecture = Claims schreiben. Orchestrator = Re-Check vor jedem Slice + Update nach jedem Slice |
| 12 | Wie sieht ein Headsup aus? Fuer Sessions/Devs und fuer Weave? | Devs: Comment im GitHub Issue mit @mention und Conflict-Details. Weave: braucht kein Headsup, laeuft automatisch beim Merge |
| 13 | Soll der Orchestrator den Check inline machen oder ein separater Agent? | Separater Agent (conflict-checker). Schont den Orchestrator-Context, konsistent mit Sub-Agent-Pattern |
| 14 | Welche Granularitaet fuer File Claims? | Datei + Beschreibung (aus Architecture). Funktions-Level als V2 |
| 15 | Kann man Devs via GitHub Action benachrichtigen (z.B. Slack)? | GitHub Issue @mention reicht fuer MVP. Slack als V2 |
| 16 | Wann soll Notification ausgeloest werden? | Bei jedem Conflict-Detection (nicht nur Critical) |
| 17 | Kann man bei Single-User doppelte Nachrichten vermeiden? | Keine Sonderlogik im MVP. Immer beide Issues kommentieren. Doppelte Notification bei Single-User akzeptabel |
| 18 | Kann der Conflict-Checker auch im Architecture Flow gecalled werden? | Ja, nach Gate 1 Approval. Fruehester moeglicher Alarm |
| 19 | Soll der Orchestrator den Check auch haben? | Ja, beides. Zwischen Architecture und Orchestrator koennen Stunden/Tage liegen, neue Sessions starten dazwischen |
