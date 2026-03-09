# Slice 6: Orchestrator Phase 4b Integration

> **Slice 6 von 6** für `conflict-aware-pipeline`

---

## Metadata (für Orchestrator)

| Key | Value |
|-----|-------|
| **ID** | `slice-06-orchestrator-phase-4b-integration` |
| **Test** | `n/a — manuelle Verifikation (Markdown-Command-Dateien)` |
| **E2E** | `false` |
| **Dependencies** | `["slice-04-worktree-erstellung-orchestrator-phase-2", "slice-05-conflict-reporter-sub-agent"]` |

---

## Test-Strategy (für Orchestrator Pipeline)

| Key | Value |
|-----|-------|
| **Stack** | `markdown-commands` |
| **Test Command** | `n/a` |
| **Integration Command** | `n/a` |
| **Acceptance Command** | Manuelle Prüfung: Beide Command-Dateien öffnen, Phase-4b-Block und State-Felder gegen ACs prüfen |
| **Start Command** | `n/a` |
| **Health Endpoint** | `n/a` |
| **Mocking Strategy** | `no_mocks` |

---

## Ziel

Fügt Phase 4b "Conflict Scan" in beide Orchestrator-Commands (`orchestrate.md`, `slim-orchestrate.md`) ein — nach Phase 4 (Final Validation), vor Phase 5 (Completion). Phase 4b enthält drei Steps: Script-Aufruf via `Bash`, bedingten Sub-Agent-Aufruf via `Task()` bei Exit-Code 1, und Label-Wechsel via `Bash` (immer). Der Orchestrator-State wird um `"conflict_scan"` und `"conflict_report"` als gültige `current_state`-Werte erweitert.

---

## Acceptance Criteria

1) GIVEN `plugins/clemens/commands/orchestrate.md` wird gelesen
   WHEN der Implementer Phase 4b einfügt
   THEN steht der Phase-4b-Block nach dem `## Phase 4` Block (Final Validation) und vor dem `## Phase 5` Block (Completion) — kein anderer Content darf zwischen Phase 4 Ende und Phase 4b Beginn stehen

2) GIVEN `plugins/clemens/commands/slim-orchestrate.md` wird gelesen
   WHEN der Implementer Phase 4b einfügt
   THEN steht der Phase-4b-Block nach dem `## Phase 4` Block und vor dem `## Phase 5` Block — identische Positionierung wie in orchestrate.md

3) GIVEN Phase 4b Step 1 wird ausgeführt
   WHEN der Orchestrator das Script aufruft
   THEN enthält Step 1 exakt diesen Bash-Aufruf: `Bash("node {plugin_path}/scripts/conflict-scanner.js --branch {state.branch} --spec-path {state.spec_path} --repo {repo}")` und speichert den Exit-Code in einer lokalen Variable — `{plugin_path}` wird aus dem bekannten Plugin-Verzeichnis aufgelöst, `{state.branch}` und `{state.spec_path}` kommen aus dem State-Objekt

4) GIVEN Step 1 liefert Exit-Code 1 (Overlap gefunden)
   WHEN der Orchestrator Step 2 ausführt
   THEN ruft er `Task("conflict-reporter", { overlap_report_path: "{state.spec_path}/overlap-report.json", own_issue_number: {parsed from script stdout}, repo: {repo} })` auf, parst das JSON-Output via `parse_agent_json()` und setzt `state.current_state = "conflict_report"` — Step 2 wird NICHT ausgeführt wenn Exit-Code 0 oder 2

5) GIVEN Step 1 liefert Exit-Code 0 (kein Overlap)
   WHEN der Orchestrator Step 2 überspringt
   THEN setzt er `state.current_state = "conflict_scan"` (ohne Sub-Agent-Aufruf) und fährt direkt mit Step 3 fort

6) GIVEN Step 1 liefert Exit-Code 2 (Fehler: gh/git nicht verfügbar)
   WHEN der Orchestrator den Fehler behandelt
   THEN loggt er eine Warning mit dem stderr-Inhalt (`"Conflict scan failed: {stderr}"`), setzt KEINEN neuen `current_state` (State bleibt auf dem Wert vor Phase 4b) und fährt mit Step 3 fort — Phase 4b ist non-blocking

7) GIVEN Step 3 wird ausgeführt (unabhängig von Exit-Code 0, 1 oder 2)
   WHEN der Orchestrator das Label setzt
   THEN enthält Step 3 exakt: `Bash("gh issue edit {own_issue_number} --repo {repo} --remove-label pipeline:running --add-label pipeline:merge-ready")` — `{own_issue_number}` wird aus dem stdout des Scripts (Exit 0 oder 1) oder dem State geparst; bei Exit 2 wird Step 3 trotzdem ausgeführt (best-effort)

8) GIVEN beide Command-Dateien nach der Änderung gelesen werden
   WHEN der Implementer die State-Machine-Kommentare prüft
   THEN enthalten die Kommentare im State-Initialisierungs-Block beide neuen Werte: `"conflict_scan"` und `"conflict_report"` als dokumentierte `current_state`-Werte — erkennbar als Inline-Kommentar oder Aufzählung der gültigen States

---

## Test Skeletons

> **Für den Test-Writer-Agent:** Stack `markdown-commands`. Tests sind strukturelle Datei-Checks via Checklisten.

### Checkliste: `specs/2026-03-08-conflict-aware-pipeline/slices/slice-06-orchestrator-phase-4b-integration.test.md`

<test_spec>
```markdown
## Position von Phase 4b (AC-1, AC-2)
- [ ] AC-1: Phase 4b in orchestrate.md steht nach `## Phase 4` Block
- [ ] AC-1: Phase 4b in orchestrate.md steht vor `## Phase 5` Block
- [ ] AC-2: Phase 4b in slim-orchestrate.md steht nach `## Phase 4` Block
- [ ] AC-2: Phase 4b in slim-orchestrate.md steht vor `## Phase 5` Block

## Step 1 — Script-Aufruf (AC-3)
- [ ] AC-3: Step 1 enthält `node {plugin_path}/scripts/conflict-scanner.js`
- [ ] AC-3: Step 1 übergibt `--branch {state.branch}`
- [ ] AC-3: Step 1 übergibt `--spec-path {state.spec_path}`
- [ ] AC-3: Step 1 übergibt `--repo {repo}`
- [ ] AC-3: Exit-Code des Bash-Aufrufs wird in Variable gespeichert

## Step 2 — Bedingter Sub-Agent-Aufruf (AC-4, AC-5, AC-6)
- [ ] AC-4: Bei Exit-Code 1 → Task("conflict-reporter") wird aufgerufen
- [ ] AC-4: Task-Prompt enthält overlap_report_path, own_issue_number, repo
- [ ] AC-4: Task-Output wird via parse_agent_json() verarbeitet
- [ ] AC-4: state.current_state = "conflict_report" nach Exit-Code 1
- [ ] AC-5: Bei Exit-Code 0 → kein Task()-Aufruf, state.current_state = "conflict_scan"
- [ ] AC-6: Bei Exit-Code 2 → Warning geloggt mit stderr-Inhalt
- [ ] AC-6: Bei Exit-Code 2 → kein state.current_state Wechsel (State bleibt)
- [ ] AC-6: Bei Exit-Code 2 → Fortfahren zu Step 3 (non-blocking)

## Step 3 — Label setzen (AC-7)
- [ ] AC-7: Step 3 enthält `gh issue edit {own_issue_number}`
- [ ] AC-7: Step 3 enthält `--remove-label pipeline:running`
- [ ] AC-7: Step 3 enthält `--add-label pipeline:merge-ready`
- [ ] AC-7: Step 3 wird bei Exit-Code 0, 1 UND 2 ausgeführt

## State-Machine-Dokumentation (AC-8)
- [ ] AC-8: State-Block in orchestrate.md enthält "conflict_scan" als current_state-Wert
- [ ] AC-8: State-Block in orchestrate.md enthält "conflict_report" als current_state-Wert
- [ ] AC-8: State-Block in slim-orchestrate.md enthält "conflict_scan" als current_state-Wert
- [ ] AC-8: State-Block in slim-orchestrate.md enthält "conflict_report" als current_state-Wert
```
</test_spec>

---

## Integration Contract

### Requires From Other Slices

| Slice | Resource | Type | Validation |
|-------|----------|------|------------|
| `slice-04-worktree-erstellung-orchestrator-phase-2` | `state.branch` | State-Feld (String) | Muss im State-Objekt vorhanden sein — wird als `--branch` Argument übergeben |
| `slice-04-worktree-erstellung-orchestrator-phase-2` | `state.spec_path` | State-Feld (String) | Muss im State-Objekt vorhanden sein — wird als `--spec-path` Argument übergeben |
| `slice-05-conflict-reporter-sub-agent` | `plugins/clemens/agents/conflict-reporter.md` | Agent-Definition | Muss existieren — wird via `Task("conflict-reporter", ...)` aufgerufen |

### Provides To Other Slices

| Resource | Type | Consumer | Interface |
|----------|------|----------|-----------|
| `state.current_state = "conflict_scan"` | State-Wert | Phase 5 (Resume-Logik) | Signalisiert: Conflict Scan abgeschlossen, kein Overlap |
| `state.current_state = "conflict_report"` | State-Wert | Phase 5 (Resume-Logik) | Signalisiert: Conflict Scan abgeschlossen, Overlap gemeldet |
| Phase-4b-Block (beide Commands) | Command-Abschnitt | Kein nachfolgender Slice | Vollständige Phase-4b-Integration in der Pipeline |

---

## Deliverables (SCOPE SAFEGUARD)

<!-- DELIVERABLES_START -->
- [ ] `plugins/clemens/commands/orchestrate.md` — Phase 4b (Conflict Scan) mit drei Steps einfügen (nach Phase 4, vor Phase 5); State-Machine-Kommentare um `"conflict_scan"` und `"conflict_report"` erweitern
- [ ] `plugins/clemens/commands/slim-orchestrate.md` — Identische Phase-4b-Änderungen wie orchestrate.md
<!-- DELIVERABLES_END -->

> **Hinweis:** Test-Dateien gehören NICHT in Deliverables. Der Test-Writer-Agent erstellt Tests basierend auf den Test Skeletons oben.

---

## Constraints

**Scope-Grenzen:**
- Dieser Slice ändert NICHT das Script `conflict-scanner.js` (Slice 3)
- Dieser Slice ändert NICHT die Agent-Definition `conflict-reporter.md` (Slice 5)
- Kein Worktree-Erstellungs-Code — gehört zu Slice 4
- Phase 5 (Completion/Cleanup) bleibt unverändert — Cleanup-Hinweis wurde bereits in Slice 4 ergänzt

**Technische Constraints:**
- `own_issue_number` muss aus dem stdout des Scripts extrahiert werden — das Script gibt die Issue-Nummer beim Erstellen aus; bei Exit-Code 2 (Fehler) ist keine Nummer verfügbar → Step 3 wird in diesem Fall übersprungen oder best-effort ausgeführt
- `parse_agent_json()` ist die bestehende Hilfsfunktion im Orchestrator für JSON-Parsing von Sub-Agent-Outputs — kein neues Parsing-Pattern einführen
- Phase 4b muss in beiden Command-Dateien identisch sein — kein divergierendes Verhalten
- Reporter-Agent-Failure (`status: "failed"`) darf Phase 4b nicht blockieren — Warning loggen, zu Step 3 weitergehen

**Referenzen:**
- Architecture: `specs/2026-03-08-conflict-aware-pipeline/architecture.md` → Section "Migration Map" (Einfügestellen in orchestrate.md und slim-orchestrate.md)
- Architecture: `specs/2026-03-08-conflict-aware-pipeline/architecture.md` → Section "Data Flow" (drei Steps von Phase 4b mit Exit-Code-Verzweigung)
- Architecture: `specs/2026-03-08-conflict-aware-pipeline/architecture.md` → Section "Error Handling Strategy" (Exit-Code 2 = Warning, non-blocking; Reporter failed = Warning)
- Architecture: `specs/2026-03-08-conflict-aware-pipeline/architecture.md` → Section "Script CLI Interface" (Exit-Code-Semantik: 0/1/2)
- Architecture: `specs/2026-03-08-conflict-aware-pipeline/architecture.md` → Section "GitHub Issue API (via gh CLI)" (Label-Wechsel-Befehl)
