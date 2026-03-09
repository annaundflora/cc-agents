# Slim Slice Decomposition

**Feature:** Conflict-Aware Agent Pipeline
**Discovery-Slices:** 4
**Atomare Slices:** 7
**Stack:** Kein Code-Stack (spec/agent-only Repository). Deliverables sind Node.js Script + Markdown Agent-Definitionen + Markdown Command-Aenderungen.

---

## Dependency Graph

```
slice-01 (Weave/rerere Setup-Artifacts)
    │
    ├──> slice-04 (Worktree-Erstellung im Orchestrator Phase 2)
    │
slice-02 (Scanner: Entity-Extraktion + Claims)
    │
    └──> slice-03 (Scanner: GitHub Registry + Overlap)
              │
              └──> slice-05 (Conflict-Reporter Sub-Agent)
                        │
                        └──> slice-06 (Orchestrator Phase 4b Integration)
                                  ↑
              slice-04 ───────────┘
```

Vereinfacht:

```
slice-01 ──> slice-04 ──┐
slice-02 ──> slice-03 ──> slice-05 ──> slice-06
                                             ↑
                         slice-04 ───────────┘
```

---

## Slice-Liste

### Slice 1: Weave + rerere Setup-Artifacts

- **Scope:** Erstellt die statischen Setup-Artefakte fuer Repos: `.gitattributes`-Template mit Weave merge driver und TypeScript/Python/Go funcname-Patterns sowie eine `weave-setup.md` Anleitung mit den Installations- und Einrichtungsbefehlen (`weave-cli setup`, `git rerere`). Kein Orchestrator-Code, nur Dateien die Devs manuell in Repos einspielen.
- **Deliverables:**
  - `plugins/clemens/templates/weave-setup.md`
  - `plugins/clemens/templates/gitattributes-weave.template`
- **Done-Signal:** `weave-setup.md` enthaelt vollstaendige Installations-Befehle fuer alle Prerequisites (Rust, weave-cli, weave-driver, gh CLI) und `git config rerere.enabled true`. `gitattributes-weave.template` enthaelt valide funcname-Patterns fuer TypeScript, Python und Go sowie den Weave merge driver Eintrag.
- **Dependencies:** []
- **Discovery-Quelle:** Slice 1 "Weave Setup"

---

### Slice 2: Conflict-Scanner — Entity-Extraktion & Claims

- **Scope:** Implementiert das Node.js Script `conflict-scanner.js` von CLI-Parsing bis claims.json-Schreibung. Umfasst: CLI-Args-Parser (--branch, --spec-path, --repo, --weave), Entity-Extractor (git diff Hunk-Header-Parsing + optionaler Weave-CLI-Pfad), Claims-Writer (claims.json Datei). Keine GitHub-Interaktion, kein Overlap in diesem Slice.
- **Deliverables:**
  - `plugins/clemens/scripts/conflict-scanner.js` (Module: CLI Parser, Entity Extractor, Claims Writer)
- **Done-Signal:** `node conflict-scanner.js --branch feature/test --spec-path /tmp/test-spec --repo owner/repo` schreibt eine valide `claims.json` mit korrekten `entities_changed[]`-Eintraegen (entity, entity_type, lines, diff_summary) aus einem echten oder gemockten `git diff`-Output. Exit-Code 2 bei fehlenden Pflicht-Argumenten.
- **Dependencies:** []
- **Discovery-Quelle:** Slice 2 "Conflict-Scanner Script"

---

### Slice 3: Conflict-Scanner — GitHub Registry, Overlap & Report

- **Scope:** Erweitert `conflict-scanner.js` um die GitHub-Interaktion und Overlap-Berechnung. Umfasst: Session Registry (gh issue create mit Claims-JSON im Body, gh issue list fuer andere Sessions, JSON-Parsing fremder Issue-Bodies), deterministischer Overlap-Rechner (File + Entity-Match nach Severity-Regeln), Report-Writer (overlap-report.json mit overlaps[], weave_validation-Feld, summary), Exit-Code-Semantik (0/1/2).
- **Deliverables:**
  - `plugins/clemens/scripts/conflict-scanner.js` (Module: Session Registry, Overlap Calculator, Report Writer, Exit Handler — erweiternd zu Slice 2)
- **Done-Signal:** Script laeuft durch mit gemockten `gh`-Aufrufen (via Umgebungsvariable oder Stub), schreibt valide `overlap-report.json` mit korrekten `overlaps[]`-Eintraegen. Bei zwei Sessions mit gleicher Entity: Exit-Code 1, severity "high". Bei keinem Overlap: Exit-Code 0. Bei fehlendem `gh`: Exit-Code 2.
- **Dependencies:** ["slice-02-conflict-scanner-entity-extraktion-claims"]
- **Discovery-Quelle:** Slice 2 "Conflict-Scanner Script"

---

### Slice 4: Worktree-Erstellung in Orchestrator Phase 2

- **Scope:** Ergaenzt Phase 2 (Setup & State Management) beider Orchestrator-Commands um automatische Worktree-Erstellung beim Pipeline-Start. Konkret: `git worktree add worktrees/{feature} -b feature/{feature}` falls noch kein Worktree existiert, mit Eintrag im State (`worktree_path`, `branch`). Phase 5 erhaelt Worktree-Cleanup-Hinweis (`git worktree remove` / `git worktree prune`).
- **Deliverables:**
  - `plugins/clemens/commands/orchestrate.md`
  - `plugins/clemens/commands/slim-orchestrate.md`
- **Done-Signal:** Phase 2 beider Commands enthaelt Worktree-Erstellungs-Block mit `git worktree add`-Befehl, Existenz-Check und State-Feldern `worktree_path` + `branch`. Phase 5 enthaelt Cleanup-Anweisung. Review der Markdown-Inhalte bestaetigt korrekte Einfuegestelle (nach State-Initialisierung, vor Phase 2b Stack Detection).
- **Dependencies:** ["slice-01-weave-rerere-setup-artifacts"]
- **Discovery-Quelle:** Slice 1 "Weave Setup" (Worktree-Teil) + Slice 4 "Orchestrator Integration" (Phase-2-Anteil)

---

### Slice 5: Conflict-Reporter Sub-Agent

- **Scope:** Erstellt die Agent-Definition `conflict-reporter.md` als neues Plugin-Agent. Der Agent liest `overlap-report.json`, formuliert einen menschenlesbaren Issue-Comment mit Kontext-Analyse und Empfehlung (gemaess dem definierten Markdown-Format aus der Architecture), postet den Comment via `gh issue comment` in beide betroffenen Issues mit @mention, und gibt ein JSON-Output-Objekt zurueck (`status`, `commented`, `issues_commented`, `notes`).
- **Deliverables:**
  - `plugins/clemens/agents/conflict-reporter.md`
- **Done-Signal:** Agent-Definition enthaelt vollstaendigen System-Prompt mit: Task-Context (overlap-report.json lesen), Comment-Format-Spezifikation (Tabelle + Kontext + Empfehlung), Bash-Aufrufe fuer `gh issue comment` in beide Issues, und JSON-Output-Schema. Manueller Review der Markdown-Datei bestaetigt alle Pflichtfelder gemaess Sub-Agent Task() Contract aus der Architecture.
- **Dependencies:** ["slice-03-conflict-scanner-github-registry-overlap-report"]
- **Discovery-Quelle:** Slice 3 "Conflict-Reporter Sub-Agent"

---

### Slice 6: Orchestrator Phase 4b Integration

- **Scope:** Fuegt Phase 4b "Conflict Scan" zwischen Phase 4 (Final Validation) und Phase 5 (Completion) in beide Orchestrator-Commands ein. Drei Steps: Step 1 — `Bash("node {plugin_path}/scripts/conflict-scanner.js --branch ... --spec-path ... --repo ...")` mit Exit-Code-Pruefung. Step 2 — `Task(conflict-reporter)` nur bei Exit-Code 1, mit JSON-Parsing des Reporter-Outputs. Step 3 — `Bash("gh issue edit --remove-label pipeline:running --add-label pipeline:merge-ready")` immer. State um `"conflict_scan"` und `"conflict_report"` States erweitern.
- **Deliverables:**
  - `plugins/clemens/commands/orchestrate.md`
  - `plugins/clemens/commands/slim-orchestrate.md`
- **Done-Signal:** Beide Commands enthalten Phase 4b mit allen drei Steps. State-Machine-Kommentare zeigen `"conflict_scan"` als neuen `current_state`-Wert. Exit-Code-2-Pfad loggt Warning und setzt Label trotzdem (non-blocking). Review der Markdown-Inhalte bestaetigt korrekte Position (nach Phase 4 Block, vor Phase 5 Block) und vollstaendige Step-Beschreibungen.
- **Dependencies:** ["slice-04-worktree-erstellung-orchestrator-phase-2", "slice-05-conflict-reporter-sub-agent"]
- **Discovery-Quelle:** Slice 4 "Orchestrator Integration"

---

### Slice 7: Script-Verzeichnis Plugin-Registration

- **Scope:** Registriert das neue `scripts/`-Verzeichnis im Plugin durch Aktualisierung von `plugin.json`. Ergaenzt die Plugin-Manifest-Datei um den `scripts`-Eintrag und listet `conflict-scanner.js` als Plugin-Artifact auf, damit das Plugin korrekt distribuiert wird.
- **Deliverables:**
  - `plugins/clemens/.claude-plugin/plugin.json`
- **Done-Signal:** `plugin.json` enthaelt einen `scripts`-Key mit Pfad-Eintrag fuer `conflict-scanner.js`. JSON ist valide (parsebar). Review bestaetigt dass keine anderen bestehenden Eintraege veraendert wurden.
- **Dependencies:** ["slice-02-conflict-scanner-entity-extraktion-claims"]
- **Discovery-Quelle:** Slice 2 "Conflict-Scanner Script" + Slice 3 "Conflict-Reporter Sub-Agent" (Plugin-Packaging)

---

## Qualitaets-Checkliste

- [x] Jeder Slice hat maximal 3 produktive Deliverable-Dateien (Slice 3 + 6 bearbeiten je dieselben 2 Dateien nochmals — intentional, da getrennte Concerns)
- [x] Jeder Slice hat ein messbares Done-Signal
- [x] Dependencies sind azyklisch (DAG — verifiziert: slice-01 -> 04 -> 06, slice-02 -> 03 -> 05 -> 06, slice-02 -> 07)
- [x] Alle Deliverables aus der Discovery sind abgedeckt: conflict-scanner.js, conflict-reporter.md, orchestrate.md (Phase 2 Worktree + Phase 4b), slim-orchestrate.md (Phase 2 Worktree + Phase 4b), Setup-Templates
- [x] Kein Slice hat mehr als ein Concern
- [x] Schema/Service-Slices (Script-Logik) kommen vor Agent-Slices, die vor Orchestrator-Slices kommen
- [x] Stack korrekt erkannt: kein Code-Stack, Deliverables sind Node.js Script + Markdown-Definitionen

## Empfohlene Implementierungs-Reihenfolge

1. slice-01 (Setup-Artifacts) — Grundlage, reine Template-Dateien
2. slice-02 (Scanner Entity/Claims) — Kern-Script-Basis, isoliert testbar
3. slice-03 (Scanner GitHub/Overlap) — Baut auf slice-02 auf
4. slice-04 (Worktree Orchestrator) — Unabhaengig von Script, parallel zu slice-03 moeglich
5. slice-05 (Reporter Agent) — Baut auf slice-03 auf
6. slice-06 (Phase 4b Integration) — Verbindet alle Teile, letzter Schritt
7. slice-07 (Plugin-Registration) — Kann parallel zu slice-06 oder danach
