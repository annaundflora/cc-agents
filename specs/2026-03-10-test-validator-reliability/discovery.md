# Feature: Pipeline Reliability (Test-Validator + Worktree-Commits)

**Epic:** --
**Status:** Ready
**Wireframes:** -- (kein UI-Feature)

---

## Problem & Solution

**Problem:**
- test-validator hängt sich in der Final Validation regelmäßig auf (~5 Min für 6s Tests)
- 5 konkrete Verhaltensprobleme (A1-A5) und 2 Pipeline-Lücken (B1-B2) beobachtet in 3 parallelen Orchestrator-Sessions
- Zombie-Prozesse aus parallelen Pipeline-Runs blockieren nachfolgende Test-Runs
- Pre-existierende Testdateien brechen bei Signatur-Änderungen, weil der Implementer sie nicht mitaktualisiert
- Sub-Agents (slice-implementer, test-writer) committen auf main/master statt auf den Feature-Branch im Worktree

**Solution:**
- test-validator Agent-Definition härten: explizite Verbote für beobachtete Anti-Patterns
- Smoke-Stage: Health-Endpoint-Existenz prüfen, Port-Cleanup, graceful Skip
- Final Validation: Lean Mode im Orchestrator (direkt `{test_cmd}` via Bash statt Sub-Agent)
- Signatur-Schutz im slice-implementer auf Testdateien erweitern
- Branch-Validierung vor jedem Commit in allen Sub-Agents

**Business Value:**
- Pipeline-Durchlaufzeit: ~5 Min → ~10s pro Final Validation
- Keine manuellen Abbrüche mehr wegen hängender Smoke-Tests
- Keine falschen Regressions-Failures durch veraltete Test-Signaturen

---

## Scope & Boundaries

| In Scope |
|----------|
| A1: Smoke-Stage Health-Endpoint-Existenz prüfen + Skip |
| A2: Explizites Verbot unnötiger File-Reads im test-validator |
| A3: Stärkeres read-only Enforcement (kein sed/Edit auf Code) |
| A4: Explizites Verbot von Background-Execution und Sleep-Polling für Tests |
| A5: Port-basiertes Cleanup vor App-Start im Smoke-Test |
| B1: Signatur-Schutz in slice-implementer auf Testdateien erweitern |
| B2: Final Validation Lean Mode im Orchestrator |
| B3: Sub-Agents committen auf main statt Worktree-Branch — Branch-Validierung + Working-Directory |

| Out of Scope |
|--------------|
| E2E-Validation mit Chrome DevTools MCP (→ separate Discovery) |
| DB-Migration/Seeding Automatisierung (→ Teil E2E-Discovery) |
| Neuer e2e-validator Sub-Agent (→ Teil E2E-Discovery) |
| Chrome DevTools MCP Integration im Smoke-Test (existiert, bleibt unverändert) |

---

## Current State Reference

> Betroffene Agent-Definitionen und ihre aktuellen Regeln

- `plugins/clemens/agents/test-validator.md`: 5-Stage Pipeline (Unit → Integration → Acceptance → Smoke → Regression), Stack-Detection-Tabelle mit hardcodierten Health-Endpoints, read-only Regel (Zeile 7+14), "KEIN Code-Fix" Regel
- `plugins/clemens/commands/orchestrate.md`: Phase 4 Final Validation ruft test-validator Sub-Agent auf mit `mode: final_validation`
- `plugins/clemens/commands/slim-orchestrate.md`: Identische Phase 4 wie orchestrate.md
- `plugins/clemens/agents/slice-implementer.md`: Signatur-Schutz-Regel (Zeile 38) — greift nur für Produktionscode-Aufrufer
- `plugins/clemens/agents/slim-slice-implementer.md`: Gleiche Signatur-Schutz-Lücke
- `plugins/clemens/agents/test-writer.md`: Commit-Anweisung `git add -A && git commit -m 'test({slice_id}): ...'` — keine Branch-Validierung
- Alle Sub-Agents mit Commit-Berechtigung haben keine Prüfung ob sie auf dem korrekten Branch arbeiten

---

## Beobachtete Probleme (Evidence aus 3 Sessions)

### A1: Hardcodierter Health-Endpoint

- **Datei:** `test-validator.md` Zeile 47
- **Stack-Detection-Tabelle:** `package.json + next` → Health-Endpoint `http://localhost:3000/api/health`
- **Realität:** aifactory hat keinen `/api/health` Route (nur `/api/download-zip`)
- **Folge:** Smoke-Poll läuft 30s ins Timeout, dann Failure
- **Zusatzproblem auf Windows:** `kill {PID}` funktioniert nicht zuverlässig, Prozesse bleiben hängen

### A2: Unnötige File-Reads vor Teststart

- **Beobachtet:** 25+ File-Reads (package.json, tsconfig.json, vitest.config.*, eslint.config.mjs, 15+ Test-Dateien, Source-Dateien)
- **Alles BEVOR** `pnpm test` gestartet wird
- **Ursache:** Keine explizite Anweisung die sagt "führe Tests direkt aus, lies keine Dateien vorab"
- **Impact:** ~30-40s Agent-Overhead

### A3: Code-Änderungen trotz read-only Regel

- **Beobachtet:** Agent nutzt `sed -i` auf `route.test.ts` um Lint-Fehler zu fixen
- **Resultat:** Datei beschädigt, musste via `git checkout` wiederhergestellt werden
- **Regelverstoß:** Zeile 7 "read-only" + Zeile 14 "KEIN Code-Fix"
- **Ursache:** Regel ist zu weich formuliert, Agent interpretiert "Auto-Fix Lint bei Final Validation" als Erlaubnis für beliebige Code-Änderungen

### A4: Sleep-Polling statt synchrone Ausführung

- **Beobachtet:** Agent startet `pnpm test` im Background, pollt mit `sleep 120` + `sleep 30` auf Output-Datei
- **Zusätzlich:** Startet `pnpm test` ein zweites Mal mit `grep` parallel
- **Impact:** ~150s reiner Sleep + doppelte Test-Runs
- **Ursache:** Keine Anweisung die synchrone Ausführung vorschreibt

### A5: Zombie-Prozesse aus parallelen Pipelines

- **Beobachtet:** 6 vitest-Prozesse parallel (model-cards x3, multi-mode-generation x1, gestrandete Runs)
- **Folge:** Neue Test-Runs kommen nicht durch, warten auf Ressourcen
- **Ursache:** App/Test-Prozesse nach Smoke-Test nicht sauber beendet + parallele Pipeline-Sessions teilen sich Ports

### B1: Signatur-Schutz greift nicht für Testdateien

- **Beobachtet:** Slice-12 ändert `modelId: string` → `modelIds: string[]` in generation-service.ts
- **Signatur-Schutz:** Aktualisiert `generation-service.test.ts` und `generations.test.ts`
- **Übersehen:** `generation-service-structured.test.ts` (von Feature "structured prompts", Slice-06)
- **Folge:** 9 Test-Failures in Regression-Stage, Debugger-Retries, Zeitverschwendung
- **Root Cause:** Signatur-Schutz-Regel erwähnt Testdateien nicht explizit

### B2: Final Validation redundant

- **Beobachtet:** Final Validation wiederholt alle Tests die 30s zuvor in letzter Slice-Validation grün waren
- **Kein neuer Code** zwischen letzter Slice-Validation und Final Validation
- **Agent-Overhead:** Stack-Detection, File-Reads, 5-Stage Pipeline — alles redundant
- **Eigentliche Tests:** ~6 Sekunden
- **Total Final Validation:** ~5 Minuten (inkl. aller Overheads A1-A4)

### B3: Sub-Agents committen auf main statt Worktree-Branch

- **Beobachtet:** slice-implementer und test-writer committen auf `master` statt auf `feature/model-cards`
- **Betroffene Agents:** slice-implementer (Agent ID: ac21589913d6046bb), test-writer (Agent ID: a9e9150b84e2902cb)
- **Commits:** `feat(slice-14): add Playwright config for E2E smoke tests`, `test(slice-14): add E2E smoke tests for model-cards feature`
- **Beide** arbeiteten in `E:/WebDev/aifactory` (Hauptverzeichnis) statt in `E:/WebDev/aifactory/worktrees/model-cards`
- **Dateien** wurden unter `worktrees/model-cards/` als Subdirectory im Hauptrepo erstellt statt direkt im Worktree
- **Nur bei `/clemens:orchestrate`** aufgetreten, nicht bei `/clemens:slim-orchestrate` (das `slim-slice-implementer` nutzt)
- **Root Cause:** Der Orchestrator übergibt `Working-Directory` nur an den test-validator im Prompt, nicht an slice-implementer/test-writer. Sub-Agents haben keine Branch-Validierung vor dem Commit. `Task()` startet Sub-Agents im CWD des Orchestrators (Hauptrepo), nicht im Worktree.

---

## Lösungsdesign

### A1: Health-Endpoint-Existenz prüfen

**Änderung in:** `test-validator.md`, Stage 4 (Smoke)

**Neues Verhalten:**
1. Stack-Detection liefert `health_endpoint` wie bisher
2. **NEU:** Prüfe ob die Route-Datei existiert (z.B. `app/api/health/route.ts` für Next.js)
3. Wenn Route-Datei nicht existiert → Fallback auf Root-URL `/`
4. Wenn Root-URL auch nicht antwortet (z.B. DB fehlt) → Smoke als `skipped` melden, nicht als `failed`
5. Smoke-Skip ist **non-blocking** (nur Warning)

**Fallback-Tabelle:**

| Stack | Primär | Route-Datei prüfen | Fallback |
|-------|--------|---------------------|----------|
| Next.js | `/api/health` | `app/api/health/route.{ts,js}` | `/` (any HTTP response) |
| FastAPI | `/health` | Grep nach `@app.get("/health")` | `/docs` |
| Express | `/health` | Grep nach `app.get("/health")` | `/` |
| Vue 3 | `http://localhost:5173` | -- | -- (Root ist Fallback) |

### A2: Keine unnötigen File-Reads

**Änderung in:** `test-validator.md`, neue Regel

**Neue Regel:**
> **Direkte Ausführung:** Lies KEINE Dateien außer den Indicator-Dateien für Stack-Detection (package.json, pyproject.toml, etc.). Starte Tests SOFORT nach Stack-Detection. KEINE Exploration der Codebase.

### A3: Stärkeres read-only Enforcement

**Änderung in:** `test-validator.md`, Regel 2

**Aktuelle Regel:** "KEIN Code-Fix -- Du führst nur aus und reportest, du fixst nichts"

**Neue Regel:**
> **Strikt read-only:** Du darfst KEINE Dateien ändern. Kein `sed`, kein `Edit`, kein `Write`, kein `cat >`. Einzige Ausnahme: `{lint_autofix_cmd}` bei mode `final_validation` (und NUR dieser exakte Command). Wenn Lint nach Auto-Fix noch Fehler hat → als `failed` reporten, NICHT manuell fixen.

### A4: Synchrone Test-Ausführung

**Änderung in:** `test-validator.md`, neue Regel

**Neue Regel:**
> **Synchrone Ausführung:** Führe ALLE Test-Commands synchron aus (`command 2>&1`). KEIN Background (`&`), KEIN `sleep`, KEIN Polling auf Output-Dateien. Einzige Ausnahme: App-Start für Smoke-Test (`{start_command} &`).

### A5: Port-basiertes Cleanup

**Änderung in:** `test-validator.md`, Stage 4 (Smoke), vor App-Start

**Neues Verhalten:**
1. **VOR App-Start:** Prüfe ob der Ziel-Port belegt ist
2. Wenn belegt → Kill den blockierenden Prozess
3. Dann erst App starten

**Plattform-Detection:**

| Plattform | Port-Check Command | Kill Command |
|-----------|-------------------|--------------|
| Linux/Mac | `lsof -ti :{port}` | `kill -9 {pid}` |
| Windows | `netstat -ano \| findstr :{port}` → PID extrahieren | `taskkill /F /PID {pid}` |

**Zusätzlich:** Nach Smoke-Test (Schritt 7) explizit plattform-aware Kill:
- Windows: `taskkill /F /PID {pid}` statt `kill {PID}`
- Fallback: `taskkill /F /T /PID {pid}` (Tree-Kill für Child-Prozesse)

### B1: Signatur-Schutz für Testdateien

**Änderung in:** `slice-implementer.md` + `slim-slice-implementer.md`, Regel "Signatur-Schutz"

**Aktuelle Regel (Zeile 38):**
> Wenn du eine bestehende Methoden-Signatur änderst (Parameter hinzu/entfernt/umbenannt), MUSST du alle Aufrufer in der Codebase finden (`Grep`) und anpassen

**Neue Regel:**
> Wenn du eine bestehende Methoden-Signatur änderst (Parameter hinzu/entfernt/umbenannt), MUSST du ALLE Aufrufer in der GESAMTEN Codebase finden (`Grep`), **einschließlich Testdateien** (`*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.test.py`, `*_test.go`), und anpassen. Testdateien anderer Features/Slices sind genauso betroffen wie Produktionscode.

### B2: Final Validation Lean Mode

**Änderung in:** `orchestrate.md` + `slim-orchestrate.md`, Phase 4

**Aktuell:** `Task(subagent_type: "test-validator", mode: "final_validation")`

**Neu:**
```
Phase 4: Final Validation (Lean Mode)

1. Lint Auto-Fix: Bash(detected_stack.lint_autofix_cmd)
2. Lint Check: Bash(detected_stack.lint_check_cmd)
   → exit_code != 0 → Debugger-Retry (max 3)
3. TypeCheck: Bash(detected_stack.typecheck_cmd)
   → exit_code != 0 → Debugger-Retry (max 3)
4. Full Test Suite: Bash("{test_cmd} 2>&1")
   → exit_code != 0 → Debugger-Retry (max 9)
5. Commit lint-fixes falls vorhanden

KEIN Sub-Agent. KEIN Stack-Re-Detection.
Nutzt detected_stack aus Phase 2b (bereits vorhanden).
```

### B3: Branch-Validierung für alle committenden Sub-Agents

**Änderung in:** `slice-implementer.md`, `slim-slice-implementer.md`, `test-writer.md` — Commit-Anweisung

**Zweistufiger Fix:**

**Stufe 1 — Orchestrator-Prompt (orchestrate.md + slim-orchestrate.md):**
- ALLE Task()-Calls an Sub-Agents die committen (Implementer, test-writer) MÜSSEN `Working-Directory` explizit im Prompt enthalten
- Format: `Working-Directory: {state.worktree_path}` (z.B. `E:/WebDev/aifactory/worktrees/model-cards`)

**Stufe 2 — Sub-Agent-Definitionen (slice-implementer, slim-slice-implementer, test-writer):**
- Neue Regel: **Branch-Validierung vor Commit**

**Neues Commit-Verfahren (ersetzt `git add -A && git commit`):**
```
1. cd {Working-Directory}
2. CURRENT_BRANCH=$(git branch --show-current)
3. IF CURRENT_BRANCH == "main" OR CURRENT_BRANCH == "master":
     HARD STOP: "FEHLER: Auf main/master — Commit verweigert. Working-Directory falsch?"
4. git add -A && git commit -m "{message}"
```

**Neue Regel für alle committenden Agents:**
> **Working-Directory ist Pflicht:** Wechsle ZUERST in das Working-Directory aus dem Orchestrator-Prompt (`cd {Working-Directory}`). Committe NIEMALS auf main/master. Prüfe `git branch --show-current` vor jedem Commit. Bei main/master → HARD STOP.

---

## Feature State Machine

### States Overview

| State | Beschreibung | Verfügbare Aktionen |
|-------|--------------|---------------------|
| `smoke_check_route` | Prüft ob Health-Endpoint-Route existiert | Route gefunden → `smoke_start`, Route fehlt → `smoke_fallback` |
| `smoke_fallback` | Fallback auf Root-URL | HTTP-Response → `smoke_pass`, Keine Response → `smoke_skip` |
| `smoke_port_cleanup` | Port belegt, Prozess wird gekillt | Kill erfolgreich → `smoke_start`, Kill fehlgeschlagen → `smoke_skip` |
| `smoke_start` | App wird gestartet | App ready → `smoke_poll`, Timeout → `smoke_fail` |
| `smoke_poll` | Health-Endpoint wird gepollt | 200 → `smoke_pass`, Timeout → `smoke_fail` |
| `smoke_pass` | Smoke bestanden | → `smoke_cleanup` |
| `smoke_fail` | Smoke fehlgeschlagen | → `smoke_cleanup` |
| `smoke_skip` | Smoke übersprungen (non-blocking) | → Regression |
| `smoke_cleanup` | App wird gestoppt (plattform-aware) | → Regression |

### Transitions (Smoke)

| Current State | Trigger | Next State | Anmerkung |
|---------------|---------|------------|-----------|
| `smoke_check_route` | Route-Datei existiert | `smoke_port_cleanup` | -- |
| `smoke_check_route` | Route-Datei fehlt | `smoke_fallback` | Fallback auf Root-URL |
| `smoke_fallback` | Any HTTP Response (2xx/3xx/4xx/5xx) | `smoke_pass` | App startet = Smoke OK |
| `smoke_fallback` | Connection refused / Timeout | `smoke_skip` | Non-blocking Warning |
| `smoke_port_cleanup` | Port frei | `smoke_start` | -- |
| `smoke_port_cleanup` | Port belegt + Kill OK | `smoke_start` | Zombie gekillt |
| `smoke_port_cleanup` | Port belegt + Kill fehlgeschlagen | `smoke_skip` | Non-blocking Warning |
| `smoke_start` | HTTP 200 in ≤30s | `smoke_pass` | -- |
| `smoke_start` | Timeout 30s | `smoke_fail` | -- |
| `smoke_pass` | -- | `smoke_cleanup` | -- |
| `smoke_fail` | -- | `smoke_cleanup` | -- |
| `smoke_cleanup` | App gestoppt | Regression | Plattform-aware Kill |

---

## Business Rules

- Smoke-Skip ist non-blocking — Pipeline läuft weiter mit Warning
- Final Validation Lean Mode nutzt KEINEN Sub-Agent
- Signatur-Schutz gilt für ALLE Dateien in der Codebase (Produktion + Tests)
- Port-Cleanup killt NUR den Prozess auf dem Ziel-Port, nicht alle node-Prozesse
- Lint Auto-Fix in Final Validation: NUR der konfigurierte `lint_autofix_cmd`, keine manuellen Fixes
- Plattform-Detection (Windows vs. Unix) für Kill-Commands ist Pflicht

---

## Implementation Slices

### Dependencies

```
Slice 1 (test-validator Härtung)
     ↓
Slice 2 (Smoke-Stage Overhaul)

Slice 3 (Final Validation Lean Mode)  ←  unabhängig von 1+2

Slice 4 (Signatur-Schutz)            ←  unabhängig von 1-3

Slice 5 (Branch-Validierung)         ←  unabhängig von 1-4, HÖCHSTE PRIORITÄT
```

### Slices

| # | Name | Scope | Testability | Dependencies |
|---|------|-------|-------------|--------------|
| 1 | test-validator Verhaltens-Härtung | A2 (keine Exploration), A3 (strikt read-only), A4 (synchrone Ausführung) — 3 neue Regeln in test-validator.md | Manuell: Orchestrator-Run, prüfen ob Agent sich an Regeln hält | -- |
| 2 | Smoke-Stage Overhaul | A1 (Health-Endpoint-Existenz), A5 (Port-Cleanup), Plattform-aware Kill, Smoke-Skip als non-blocking | Manuell: Smoke gegen Projekt ohne /api/health, Zombie-Prozess-Szenario | Slice 1 |
| 3 | Final Validation Lean Mode | B2: Phase 4 in orchestrate.md + slim-orchestrate.md ersetzen durch Lean Mode (direkte Bash-Calls) | Manuell: Orchestrator-Run, Final Validation misst <30s statt >5min | -- |
| 4 | Signatur-Schutz für Testdateien | B1: Regel in slice-implementer.md + slim-slice-implementer.md erweitern | Manuell: Slice mit Signatur-Änderung, prüfen ob Testdateien mitaktualisiert werden | -- |
| 5 | Branch-Validierung für Sub-Agent-Commits | B3: Commit-Verfahren in slice-implementer.md, slim-slice-implementer.md, test-writer.md — Branch-Check vor Commit. Orchestrator-Prompts in orchestrate.md + slim-orchestrate.md — Working-Directory an alle committenden Sub-Agents übergeben. | Manuell: Orchestrator-Run mit Worktree, prüfen ob Commits auf Feature-Branch landen | -- |

### Recommended Order

1. **Slice 5:** Branch-Validierung — HÖCHSTE PRIORITÄT, verhindert Commits auf main (Daten-Korruption)
2. **Slice 1:** test-validator Verhaltens-Härtung — Basis für Smoke-Overhaul, verhindert Anti-Patterns
3. **Slice 4:** Signatur-Schutz — Unabhängig, schneller Win
4. **Slice 3:** Final Validation Lean Mode — Größter Zeitgewinn (~5 Min → ~10s)
5. **Slice 2:** Smoke-Stage Overhaul — Komplexester Slice, braucht Plattform-Testing

---

## Context & Research

### Beobachtungen aus 3 Sessions

| Session | Projekt | Problem | Evidence |
|---------|---------|---------|----------|
| Session 1 | aifactory/multi-mode-generation | Smoke hängt auf /api/health (nicht vorhanden), Zombie-Prozesse | test-validator Trace: 43+ Tool-Uses, Background-Polls, Interrupted |
| Session 2 | aifactory/generation-ui-improvements | 25+ File-Reads, sed auf Testdatei, Sleep-Polling 120s+30s | test-validator Trace: 43+ Tool-Uses, eslint config gelesen, git checkout nötig |
| Session 3 | aifactory/model-cards | 9 Test-Failures wegen modelId→modelIds Signaturänderung | generation-service-structured.test.ts nicht mitaktualisiert |

### Zeitanalyse Final Validation (pro Run)

| Phase | Dauer | Nötig? |
|-------|-------|--------|
| Agent-Start + Stack Detection | ~10s | Redundant (schon in Phase 2b) |
| File-Reads (25+ Dateien) | ~30-40s | Unnötig |
| Lint Auto-Fix + Check | ~15s | Ja (aber direkt via Bash) |
| Tests (pnpm test) | ~6s | Ja |
| Smoke-Poll Timeout | ~100s | Nein (Endpoint existiert nicht) |
| Sleep-Polling | ~150s | Nein (Bug) |
| **Total** | **~300-350s** | **~25s nötig** |

---

## Open Questions

| # | Question | Options | Recommended | Decision |
|---|----------|---------|-------------|----------|
| 1 | Wie soll E2E-Seeding gelöst werden? (DB-Testdaten für E2E-Validator) | A) Seed-Script als Deliverable B) e2e-validator erstellt Daten C) Manuelle Voraussetzung | -- | Offen (→ E2E-Discovery) |

---

## Q&A Log

| # | Frage | Antwort |
|---|-------|---------|
| 1 | Sollen alle 6 Probleme (A1-A4 + B1-B2) in einer Discovery behandelt werden? | Ja, alle Probleme + ein weiteres (A5: Zombie-Prozesse). Total 7 Probleme. |
| 2 | Gibt es weitere Probleme aus anderen Sessions? | Ja: A5 (Zombie vitest-Prozesse aus parallelen Pipelines blockieren neue Runs). 6 vitest-Prozesse parallel in model-cards, multi-mode-generation. |
| 3 | Soll Final Validation komplett entfallen oder lean werden? | Lean Mode: Orchestrator führt `pnpm test` direkt via Bash aus. |
| 4 | Soll E2E-Validation Teil dieser Discovery sein? | Nein, E2E ist out-of-scope. Wird separate Discovery. |
| 5 | Wie soll Signatur-Schutz für Testdateien gelöst werden? | Regel in slice-implementer erweitern: auch Testdateien (*.test.ts, *.test.tsx, *.spec.ts) suchen und anpassen. |
| 6 | Wie soll Zombie-Prozess-Cleanup funktionieren? | Port-basiertes Cleanup: Vor App-Start prüfen ob Port belegt ist, wenn ja → blockierenden Prozess killen. |
| 7 | Passt der reduzierte Scope (ohne E2E)? | Ja, Dokument schreiben. |
| 8 | Welcher Sub-Agent committet auf main statt Worktree-Branch? | slice-implementer + test-writer beim Standard `/clemens:orchestrate`. Beide arbeiteten im Hauptverzeichnis statt Worktree. Root Cause: Orchestrator übergibt Working-Directory nicht an alle committenden Sub-Agents, Sub-Agents haben keine Branch-Validierung. |
