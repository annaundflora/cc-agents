# Gate 1: Architecture Compliance Report

**Gepruefte Architecture:** `specs/2026-03-08-conflict-aware-pipeline/architecture.md`
**Pruefdatum:** 2026-03-12
**Discovery:** `specs/2026-03-08-conflict-aware-pipeline/discovery.md`
**Wireframes:** N/A (Tooling-Feature, kein UI -- Discovery bestaetigt: "Wireframes: -- (tooling feature, no UI)")

---

## Summary

| Status | Count |
|--------|-------|
| PASS | 20 |
| BLOCKING | 0 |

**Verdict:** APPROVED

---

## A) Feature Mapping

| Discovery Feature | Architecture Section | API Endpoint / Contract | State / Storage | Status |
|---|---|---|---|---|
| Two-Phase Claims (predicted + actual) | Problem & Solution, Agent Logic (Pre-Scan / Post-Scan) | Scanner Task() Contract: mode="predict" / mode="actual" | predicted-claims.json, claims.json, GitHub Issue Body | PASS |
| Worktree Setup (Phase 0) | Data Flow: Phase 0 Step 0a | Orchestrator Bash: `git worktree add/list`, `git rebase main` | .orchestrator-state.json: worktree_path, branch | PASS |
| git rerere Aktivierung | Constraints & Integrations (Conflict Memory) | `git config rerere.enabled true` | Git-intern | PASS |
| GitHub Session-Registry | API Design: GitHub Issue API, Database Schema: GitHub Issue Body | gh issue create/list/edit/comment via Bash | GitHub Issues (remote) | PASS |
| Conflict-Scanner Sub-Agent (Pre-Scan) | Agent Logic: Pre-Scan Steps 1-10, Task() Contract | Task(conflict-scanner, mode=predict) | predicted-claims.json | PASS |
| Conflict-Scanner Sub-Agent (Post-Scan) | Agent Logic: Post-Scan Steps 1-9, Task() Contract | Task(conflict-scanner, mode=actual) | claims.json, overlap-report.json | PASS |
| Conflict-Reporter Sub-Agent | Agent Logic referenced, Reporter Task() Contract | Task(conflict-reporter) | GitHub Issue Comments | PASS |
| Orchestrator Integration Phase 0 | Data Flow: Phase 0 | Orchestrator: Step 0a (Worktree) + Step 0b (Pre-Scan Task) | .orchestrator-state.json | PASS |
| Orchestrator Integration Phase 4b | Data Flow: Phase 4b | Orchestrator: Step 1 (Post-Scan) + Step 2 (Reporter) + Step 3 (Label) | .orchestrator-state.json | PASS |
| Plugin-Packaging | Agent Logic, Migration Map | `plugins/clemens/agents/conflict-scanner.md` | Agent-Definition (Markdown) | PASS |
| Non-blocking Conflict Scan | Error Handling Strategy | Agent failure = Warning, Pipeline continues | N/A | PASS |
| Advisory Pre-Scan (nicht blocking) | Error Handling: Phase 0 | has_overlap=true: Warning, weiter | N/A | PASS |
| Entity-Level Granularitaet (Post-Scan) | Agent Logic: Post-Scan Step 2 | git diff Hunk Headers -> entity_type enum | claims.json: entities_changed[] | PASS |
| File-Level Granularitaet (Pre-Scan) | Agent Logic: Pre-Scan Steps 1-4 | Spec-Deliverables -> file paths | predicted-claims.json: files_claimed[] | PASS |
| Severity Rules (deterministic) | Overlap-Berechnung | same_entity=high, same_file_different_entity=low | overlap-report.json: overlaps[].severity | PASS |
| Reporter nur bei Post-Scan Overlap | Data Flow: Phase 4b Step 2 | "nur bei has_overlap=true" | N/A | PASS |
| Label Management | API Design: GitHub Issue API, Data Flow Step 3 | gh issue edit --remove-label/--add-label | GitHub Issue Labels | PASS |
| Stale Issue Detection | Risks: Stale Issues | Issue-Alter pruefen (>24h + kein Commit) | N/A | PASS |
| Merge ist manuell (MVP) | Scope: Out of Scope "Merge Queue Automatisierung" | N/A | N/A | PASS |
| Cross-Platform (Win/Mac/Linux) | Constraints, Quality Attributes | Agent nutzt git/gh CLI | N/A | PASS |

---

## B) Constraint Mapping

| Constraint | Source | Architecture | Status |
|---|---|---|---|
| GitHub Issue Body < 65536 chars | Discovery: GitHub Issue Schema | Risks: "Claims kuerzen (nur Top-50 Entities)" | PASS |
| gh CLI muss installiert + auth sein | Discovery: Prerequisites | Error Handling: gh nicht installiert/authentifiziert -> Skip | PASS |
| Conflict Scan < 60s total | Discovery: NFRs | Quality Attributes: "Agent < 30s pro Aufruf, Pre+Post < 60s" | PASS |
| Cost ~$0.10-0.20 pro Run | Discovery: NFRs | Quality Attributes: "Scanner ~$0.05-0.10 x 2, Reporter nur bei Overlap" | PASS |
| Max ~20 parallele Sessions | Discovery: Assumptions | Risks: "gh issue list --limit 100 reicht" + Erhoehung auf 500 | PASS |
| Non-blocking: Pipeline nie blockiert | Discovery: Business Rules | Error Handling: alle Failures = Warning, Pipeline weiter | PASS |
| JSON-Output-Contract | Discovery: Business Rules | Agent Logic: definierte JSON-Schemas, parse_agent_json() | PASS |
| Kein Source Code in Issues | Discovery: Data Protection | Security: "Nur Entity-Namen und Zeilen-Ranges, kein Source Code" | PASS |
| Relative Pfade in Issues | Discovery: Data Protection | Security: "Keine absoluten Pfade exponieren" | PASS |
| Worktree-Erstellung Fallback | Discovery: Business Rules | Error Handling: "Worktree-Failure = Warning, weiter ohne Worktree" | PASS |
| Rebase Conflict Fallback | Discovery: Business Rules | Error Handling: "git rebase --abort, weiter auf altem Stand" | PASS |
| Reporter entscheidet NICHT | Discovery: Business Rules | Reporter Task() Contract: nur Comment, keine Merge-Entscheidung | PASS |

---

## C) Realistic Data Check

### Codebase Evidence

```
Kein SQL-Schema vorhanden -- Feature nutzt File-basierte JSON-Dateien + GitHub Issue Body.
Alle "Datenbank"-Felder sind JSON-Properties mit definierten Typen (String, Integer, Array, Enum).
GitHub Issue Body hat 65536 char Limit (GitHub API).
```

### External API Analysis

| API | Field | Measured / Documented | Architecture Handling | Status |
|---|---|---|---|---|
| GitHub Issues API | Issue Body | 65536 chars max (GitHub API docs) | Risks: "Large-Feature: Claims kuerzen (nur Top-50 Entities)" | PASS |
| GitHub Issues API | Rate Limit | 5000 req/h authenticated | Rate Limiting: "Agents nutzen < 10 Calls pro Run" (< 15 total) | PASS |
| GitHub Issues API | Issue List | Default 30, max 100 per page | "gh issue list --limit 100" | PASS |
| gh CLI | HTTP Timeout | Built-in 30s per request | "gh CLI nutzt Built-in HTTP-Timeouts (default: 30s)" | PASS |

### Data Type Verdicts

| Field | Type | Evidence | Verdict | Issue |
|---|---|---|---|---|
| session_id | UUID v4 String | Standard UUID format, 36 chars | PASS | -- |
| feature | String | Feature-Namen aus Spec-Ordnern, typisch 20-50 chars | PASS | -- |
| branch | String | `feature/{feature-name}`, typisch 30-70 chars | PASS | -- |
| spec_path | String | `specs/YYYY-MM-DD-feature/`, typisch 30-60 chars | PASS | -- |
| file (in claims) | String (relative path) | Relative Pfade, typisch < 200 chars | PASS | -- |
| entity | String or null | Funktions-/Klassennamen aus Hunk Headers, typisch < 100 chars | PASS | -- |
| entity_type | Enum | 5 Werte: function/class/method/new_file/unknown | PASS | -- |
| overlap_type | Enum | 2 Werte: same_entity/same_file_different_entity | PASS | -- |
| severity | Enum | 3 Werte: none/low/high | PASS | -- |
| diff_summary | String | Format "+N -M", max ~10 chars | PASS | -- |
| lines | [Integer, Integer] | Zeilen-Range, valide fuer jede Dateigroesse | PASS | -- |

Hinweis: Da alle Datenstrukturen JSON-Dateien sind (keine SQL-Datenbank), gibt es keine VARCHAR-Laengen-Constraints. JSON-Strings sind unbegrenzt lang. Das einzige harte Limit ist der GitHub Issue Body (65536 chars), welches in der Architecture adressiert ist.

---

## D) External Dependencies

### D1) Dependency Version Check

**Projekt-Typ:** Existing Project (plugin.json vorhanden, Version 1.2.9)

| Dependency | Arch Version | Pinning File | Actual Installed | Status |
|---|---|---|---|---|
| Git | "Git 2.x (pre-installed)" | System-Tool | git 2.50.1 (installed) | PASS -- "2.x" ist korrekt, System-Tool hat keine Pinning-File |
| GitHub CLI (gh) | "gh >=2.0.0 (tested: v2.81.0)" | System-Tool | gh 2.81.0 (installed) | PASS -- >=2.0.0 ist korrekt, Minimum-Version + tested-Version dokumentiert |
| Claude Code Task() | "Plugin v1.2.0+" | plugin.json: "1.2.9" | 1.2.9 >= 1.2.0 | PASS |

Hinweis: Dieses Feature hat KEINE npm/pip/cargo Dependencies. Es besteht ausschliesslich aus Markdown Agent-Definitionen + existierenden System-Tools (git, gh). Es gibt kein `package.json` fuer dieses Feature (der bestehende conflict-scanner.js wird entfernt).

### D2) External APIs & Services

| Dependency | Rate Limits | Auth | Errors | Timeout | Status |
|---|---|---|---|---|---|
| GitHub Issues API (via gh CLI) | 5000/h authenticated, Agent < 15 calls/run | gh auth login (pre-configured) | gh nicht installiert: Skip. Auth-Fehler: Skip. 404: Skip. JSON-Parse: Skip. Reporter-Fail: Warning | gh built-in 30s HTTP timeout | PASS |
| Git CLI | N/A (lokal) | N/A | Worktree-Failure: Warning. Rebase-Conflict: abort + Warning | N/A | PASS |

---

## E) Migration Completeness

> Scope enthaelt Migration: Ja (Script -> Sub-Agent, Worktree-Verschiebung Phase 2 -> Phase 0, Phase 4b Script -> Task())

### Quantitaets-Check

| Discovery Claim | Architecture Coverage | Status |
|---|---|---|
| 3 Slices (Scanner, Reporter, Orchestrator Integration) | Migration Map: 8 Zeilen (7 existierende Dateien + 1 neue Datei) | PASS -- Migration Map deckt alle betroffenen Dateien ab |

### Qualitaets-Check

| File in Migration Map | Current Pattern | Target Pattern | Specific enough for test? | Status |
|---|---|---|---|---|
| `plugins/clemens/commands/orchestrate.md` | Phase 1...Phase 5 (Worktree in Phase 2, Script Phase 4b) | Phase 0 (Worktree + Pre-Scan Task) einfuegen, Phase 2 Worktree entfernen, Phase 4b Script durch Task() ersetzen, neue States worktree_setup + pre_scan | Yes -- Testbar: Phase 0 muss vor Phase 1 stehen, Task(conflict-scanner, mode=predict), keine `node conflict-scanner.js` Referenz | PASS |
| `plugins/clemens/commands/slim-orchestrate.md` | Phase 1...Phase 5 | Identische Aenderungen wie orchestrate.md | Yes -- Gleiche Pruefungen | PASS |
| `plugins/clemens/commands/conflict-scan.md` | `Bash("node scripts/conflict-scanner.js --branch ... --weave")` | `Task(conflict-scanner, mode=actual)` + `Task(conflict-reporter)` bei Overlap | Yes -- Testbar: kein `node` Aufruf, Task() Pattern, --base und --weave entfallen | PASS |
| `plugins/clemens/agents/conflict-scanner.md` | Existiert nicht | NEU ERSTELLEN: Agent-Definition mit Read/Glob/Grep/Bash/Write, zwei Modi (predict/actual), JSON-Output-Contract | Yes -- Testbar: Datei existiert, Tools-Zeile enthaelt Read/Glob/Grep/Bash/Write, zwei Modi dokumentiert | PASS |
| `plugins/clemens/scripts/conflict-scanner.js` | 1007 LOC Node.js Script | ENTFERNEN | Yes -- Testbar: Datei darf nicht existieren | PASS |
| `plugins/clemens/scripts/conflict-scanner.test.js` | 1819 LOC Test-Datei | ENTFERNEN | Yes -- Testbar: Datei darf nicht existieren | PASS |
| `plugins/clemens/scripts/simulate-conflict-scanner.sh` | 759 LOC Simulations-Script | ENTFERNEN | Yes -- Testbar: Datei darf nicht existieren | PASS |
| `plugins/clemens/agents/conflict-reporter.md` | Bestehende Agent-Definition mit Weave-Referenzen | Weave-Referenzen entfernen, neue Severity-Logik (high -> manueller Review, low -> wahrscheinlich konfliktfrei) | Yes -- Testbar: kein "weave" (case-insensitive) in Datei, severity-basierte Empfehlung dokumentiert | PASS |

### Codebase-Validierung der Migration Map

Die folgenden Dateien wurden in der Codebase verifiziert:

| Datei | Existiert? | LOC | Vermerk |
|---|---|---|---|
| `plugins/clemens/commands/orchestrate.md` | Ja | 526 Zeilen | Phase 4b Zeile 483: `node {plugin_path}/scripts/conflict-scanner.js` -- bestaetigt Script-Aufruf der ersetzt werden muss |
| `plugins/clemens/commands/slim-orchestrate.md` | Ja | 567 Zeilen | Phase 4b Zeile 514: identischer Script-Aufruf |
| `plugins/clemens/commands/conflict-scan.md` | Ja | 99 Zeilen | Zeile 35: `node {plugin_path}/scripts/conflict-scanner.js` + --weave Flag |
| `plugins/clemens/agents/conflict-scanner.md` | Nein | -- | Muss NEU ERSTELLT werden (korrekt in Migration Map) |
| `plugins/clemens/scripts/conflict-scanner.js` | Ja | 1007 LOC | Muss ENTFERNT werden |
| `plugins/clemens/scripts/conflict-scanner.test.js` | Ja | 1819 LOC | Muss ENTFERNT werden |
| `plugins/clemens/scripts/simulate-conflict-scanner.sh` | Ja | 759 LOC | Muss ENTFERNT werden |
| `plugins/clemens/agents/conflict-reporter.md` | Ja | 209 Zeilen | 15 Weave-Referenzen gefunden -- bestaetigt Aenderungsbedarf |

Zusaetzliche Validierung: Beide Orchestrator-Dateien haben `worktree_setup` und `pre_scan` NICHT in ihren gueltigen State-Werten (Zeile 93-96 / 102-105). Architecture dokumentiert korrekt dass diese als neue States hinzugefuegt werden muessen.

---

## Blocking Issues

Keine.

---

## Recommendations

Keine. Alle Checks bestanden.

---

## Verdict

**Status:** APPROVED

**Blocking Issues:** 0
**Warnings:** 0

Architecture ist vollstaendig, konsistent mit Discovery, alle Migration Map Eintraege sind auf Datei-Ebene mit spezifischen Target Patterns, alle externen Dependencies sind korrekt versioniert, alle JSON-Schemas sind definiert, Error Handling ist fuer jeden Fehlerfall dokumentiert.

**Next Steps:**
- [ ] Architecture ist bereit fuer Slice-Writing (Gate 2)
