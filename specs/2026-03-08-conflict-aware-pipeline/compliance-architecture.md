# Gate 1: Architecture Compliance Report

**Gepruefte Architecture:** `specs/2026-03-08-conflict-aware-pipeline/architecture.md`
**Pruefdatum:** 2026-03-09
**Discovery:** `specs/2026-03-08-conflict-aware-pipeline/discovery.md`
**Wireframes:** N/A (tooling feature, no UI -- Discovery: "Wireframes: -- (tooling feature, no UI)")

---

## Summary

| Status | Count |
|--------|-------|
| PASS | 45 |
| WARNING | 0 |
| BLOCKING | 0 |

**Verdict:** APPROVED

---

## A) Feature Mapping

| Discovery Feature | Architecture Section | API Endpoint | DB Schema | Status |
|-------------------|---------------------|--------------|-----------|--------|
| Worktree-Isolation (auto Worktree + Branch) | Scope, Data Flow, Migration Map | N/A (git CLI: `git worktree add`) | .orchestrator-state.json erweitert | PASS |
| Weave Setup (Merge Driver + .gitattributes) | Scope (optional), Integrations | N/A (`weave-cli setup`) | N/A | PASS |
| git rerere Aktivierung | Scope, Integrations | N/A (`git config rerere.enabled true`) | N/A | PASS |
| GitHub Session-Registry (Issue pro Run) | Scope, GitHub Issue API, Schema: GitHub Issue Body | `gh issue create/list/edit/comment` | GitHub Issue Body (JSON) | PASS |
| Conflict-Scanner Script (`conflict-scanner.js`) | Scope, Server Logic Modules, Entity Extraction Strategy, Overlap-Berechnung | Script CLI Interface (`--branch`, `--spec-path`, `--repo`, `--weave`) | claims.json, overlap-report.json | PASS |
| Conflict-Reporter Sub-Agent | Scope, Sub-Agent Task() Contract | Task() mit Input/Output Contract | N/A (liest overlap-report.json) | PASS |
| Orchestrator Integration Phase 4b | Scope, Data Flow (3 Steps), Migration Map | Bash + Task() | .orchestrator-state.json | PASS |
| Plugin-Packaging (scripts/ + agents/) | Scope, Context & Research: Plugin-Packaging | N/A | N/A | PASS |
| Entity-Level Claims (JSON in Issue Body) | Schema: claims.json, Schema: GitHub Issue Body | `gh issue create --body` | GitHub Issue Body JSON | PASS |
| Overlap-Berechnung (File + Entity Match) | Overlap-Berechnung (deterministisch) Pseudocode | N/A (internal logic) | overlap-report.json overlaps[] | PASS |
| Severity-Regeln (none/low/high) | Overlap-Berechnung Pseudocode | N/A | overlaps[].severity Enum | PASS |
| Exit-Code Semantik (0/1/2) | Script CLI Interface Exit Code Table | Exit codes 0/1/2 | N/A | PASS |
| Non-blocking Conflict Scan | Error Handling Strategy, Constraints | Exit 2 = Warning, Pipeline continues | N/A | PASS |
| Sub-Agent nur bei Overlap (~2%) | Data Flow Step 2, Quality Attributes | Task() nur bei Exit 1 | N/A | PASS |
| Weave CLI als optionales Enhancement | Entity Extraction Strategy, Technology Decisions, `--weave` Flag | `weave-cli preview main` | weave_validation in overlap-report.json | PASS |
| Git diff Hunk Headers als Primary | Entity Extraction Strategy (PRIMARY), Technology Decisions | `git diff main...{branch}` | N/A | PASS |

**Feature Mapping: 16/16 PASS**

---

## B) Constraint Mapping

| Constraint | Source | Architecture | Status |
|------------|--------|--------------|--------|
| Cross-Platform (Win/Mac/Linux) | Discovery: Design-Prinzipien | Constraints: "Node.js (path.posix fuer Pfade), git/gh CLI". Quality Attributes: "Test auf Win + Mac" | PASS |
| Zero npm Dependencies | Discovery: Design-Prinzipien (implizit) | Constraints: "Script darf kein package.json haben. Nur Node.js Built-ins: child_process, fs, path, crypto" | PASS |
| Maximal deterministisch | Discovery: Design-Prinzipien | Constraints: "Keine LLM-Calls im Script, nur strukturierte Vergleiche". Quality Attributes: "Gleicher Input = Gleicher Output" | PASS |
| Plugin-Packaging | Discovery: Scope, Plugin-Packaging | Constraints: `plugins/clemens/scripts/conflict-scanner.js`. Context: Plugin-Packaging tree | PASS |
| Non-blocking Pipeline | Discovery: Business Rules | Constraints: "Exit 2 = Warning, Pipeline geht weiter". Error Handling: Reporter Agent failed = Log, weiter | PASS |
| Kosten-effizient (98% $0) | Discovery: Design-Prinzipien | Quality Attributes: "Script deterministisch (immer). Sub-Agent (LLM) nur bei Overlap (~2%)" | PASS |
| GitHub Issue Body < 65536 chars | Discovery: implizit (GitHub API Limit) | Risks & Assumptions: "Claims JSON fuer typische Features ~2-5 KB. Large-Feature: Claims kuerzen (nur Top-50 Entities)" | PASS |
| Max ~20 parallele Sessions | Discovery: implizit | Risks & Assumptions: "`gh issue list --limit 100` reicht. Erhoehen auf --limit 500" | PASS |
| Performance < 30s total | Discovery: implizit | Quality Attributes: "Script < 10s (git diff + gh API). Agent < 20s (nur bei Overlap)" | PASS |
| Ein Issue pro Pipeline-Run | Discovery: Business Rules | Schema: GitHub Issue Body (eine Session pro Issue). API Design: `gh issue create` einmalig | PASS |
| Script Exit-Code Semantik 0/1/2 | Discovery: Business Rules | Script CLI Interface: 3-row Exit Code Table mit Orchestrator Actions | PASS |
| Claims aus weave-cli ODER git diff | Discovery: Business Rules, Weave CLI Table | Entity Extraction Strategy: Two methods table (PRIMARY: git diff, OPTIONAL: weave) | PASS |
| Merge ist manuell im MVP | Discovery: Business Rules, Out of Scope | Out of Scope: "Merge Queue Automatisierung (manueller Merge im MVP)" | PASS |
| gh + git Voraussetzung | Discovery: Prerequisites | Validation Rules: gh auth status check, git repo check. Both = Exit 2 on failure | PASS |

**Constraint Mapping: 14/14 PASS**

---

## C) Realistic Data Check

### Codebase Evidence

```
# Existierende Patterns in der Codebase:
- Kein package.json vorhanden (Greenfield fuer Script -- Architecture: "Zero npm Dependencies")
- Kein .gitattributes vorhanden (wird von Weave Setup erstellt, Slice 1)
- Kein scripts/ Verzeichnis in plugins/clemens/ (wird neu erstellt, Slice 2)
- Plugin-Version: 1.1.0 (plugin.json) -- Architecture requires v1.1.0+: consistent
- 21 Agent-Definitionen in plugins/clemens/agents/ -- conflict-reporter.md wird NEU (Slice 3)
- 2 Orchestrator-Commands: orchestrate.md, slim-orchestrate.md -- beide in Migration Map
- State-File Pattern: .orchestrator-state.json mit current_state Field -- Architecture extends mit conflict_scan
- Evidence-Dir Pattern: .claude/evidence/{feature}/ -- nicht betroffen
- Sub-Agent Pattern: Task(subagent_type, prompt) -> JSON via parse_agent_json() -- Architecture nutzt gleiches Pattern
```

### External API Analysis

| API | Field | Measured Length | Sample | Arch Type | Recommendation |
|-----|-------|----------------|--------|-----------|----------------|
| GitHub Issue Body | body | ~2-5 KB typical, max 65536 chars (GitHub API limit, verified) | JSON mit entities_changed[] + session JSON | String via gh CLI | PASS -- Architecture documents 65536 limit and Top-50 mitigation |
| GitHub Issue Title | title | ~30-50 chars deterministic | "Pipeline: workspace-redesign" | String via gh CLI | PASS -- Short, deterministic format |
| gh issue list --json | body field | Variable per issue | JSON array of issue objects | JSON.parse in try/catch | PASS -- Defensive parsing documented in Error Handling |
| gh issue list --json | number field | Integer | 47 | Integer | PASS -- Standard GitHub issue number |
| weave-cli preview | text output | Variable (entity analysis) | Entity-Match-Status per file | Text, parsed to weave_validation Object | PASS -- Only used with --weave flag, null fallback documented |
| git diff hunk headers | @@ line | ~50-200 chars per hunk | `@@ -42,10 +42,15 @@ function PromptArea() {` | Regex-parsed to entity name | PASS -- Entity Extraction Strategy documents parsing |

### Data Type Verdicts

| Field | Arch Type | Evidence | Verdict | Issue |
|-------|-----------|----------|---------|-------|
| claims.json: entities_changed[].file | String (relative path) | Relative paths in typical projects < 200 chars. No DB storage, file-based JSON -- unbounded String in JSON is fine | PASS | -- |
| claims.json: entities_changed[].entity | String or null | Function/class names typically < 100 chars. Null for new files. JSON String, no length constraint needed | PASS | -- |
| claims.json: entities_changed[].entity_type | Enum: function/class/method/new_file/unknown | 5 well-defined values from Hunk Header Heuristik table | PASS | -- |
| claims.json: entities_changed[].lines | [Integer, Integer] | Line number tuple, reasonable range for any source file | PASS | -- |
| claims.json: entities_changed[].diff_summary | String | Format "+N -M", typically < 20 chars | PASS | -- |
| claims.json: summary.files_changed | Integer >= 0 | Count of changed files. Typical: 5-50 | PASS | -- |
| claims.json: summary.entities_changed | Integer >= 0 | Count of changed entities. Typical: 10-100 | PASS | -- |
| claims.json: summary.new_files | Integer >= 0 | Count of new files. Typical: 0-20 | PASS | -- |
| overlap-report.json: session_id | String UUID v4 | 36 chars fixed format (8-4-4-4-12). Generated via crypto.randomUUID() | PASS | -- |
| overlap-report.json: feature | String | Feature names from branch, typically < 100 chars | PASS | -- |
| overlap-report.json: branch | String | Branch names `feature/*`, typically < 200 chars | PASS | -- |
| overlap-report.json: scan_timestamp | String ISO 8601 | 24 chars fixed format (e.g. "2026-03-09T14:30:00Z") | PASS | -- |
| overlap-report.json: overlaps[].their_issue | Integer | GitHub issue number, standard integer range | PASS | -- |
| overlap-report.json: overlaps[].their_user | String | GitHub username, max 39 chars per GitHub | PASS | -- |
| overlap-report.json: overlaps[].overlap_type | Enum: same_entity/same_file_different_entity | 2 well-defined values from Overlap-Berechnung pseudocode | PASS | -- |
| overlap-report.json: overlaps[].severity | Enum: low/high | 2 values, deterministic from overlap_type | PASS | -- |
| overlap-report.json: weave_validation | Object or null | null when --weave not used. Object with 3 sub-fields when used. Architecture documents "weave_validation Herleitung" section | PASS | -- |
| overlap-report.json: weave_validation.auto_resolvable | Boolean | true/false from weave-cli preview output | PASS | -- |
| overlap-report.json: weave_validation.conflict_entities | String[] | Entity names Weave cannot resolve. Array of strings | PASS | -- |
| overlap-report.json: weave_validation.confidence | Enum: high/medium/low | 3 values, heuristic from preview output | PASS | -- |
| overlap-report.json: summary.max_severity | Enum: none/low/high | 3 values. "none" when overlaps[] is empty | PASS | -- |
| GitHub Issue Body: session JSON block | String (embedded JSON) | ~200-500 bytes: session_id + feature + branch + spec_path + started_at | PASS | Well within 65536 limit |
| GitHub Issue Body: claims JSON block | String (embedded JSON) | ~2-5 KB typical. Architecture mitigates large features with Top-50 Entities cap | PASS | -- |

**Note:** All data is stored as file-based JSON (claims.json, overlap-report.json) or GitHub Issue bodies, not in a SQL database. Traditional VARCHAR/TEXT sizing concerns do not apply. The critical constraints are:
1. GitHub Issue Body limit (65536 chars) -- documented and mitigated with Top-50 Entities fallback
2. JSON schema completeness between Discovery and Architecture -- verified complete (all fields present)
3. Enum value consistency -- verified: all enums match between Discovery and Architecture

---

## D) External Dependencies

### D1) Dependency Version Check

**Project Type:** Greenfield (no package.json for the script, script uses only Node.js built-ins)

| Dependency | Arch Version | Pinning File | Pinned? | "Latest"? | Actual Latest | Current? | Status |
|------------|-------------|--------------|---------|-----------|---------------|----------|--------|
| Weave CLI | v0.2.3 (2026-03-09) | N/A Greenfield | N/A | No -- explicit version | v0.2.3 (2026-03-09, [GitHub Releases](https://github.com/Ataraxy-Labs/weave/releases)) | Yes | PASS |
| Weave Driver | v0.2.3 (2026-03-09) | N/A Greenfield | N/A | No -- explicit version | v0.2.3 (2026-03-09, [GitHub Releases](https://github.com/Ataraxy-Labs/weave/releases)) | Yes | PASS |
| GitHub CLI (gh) | >=2.85.0 (tested: v2.87.3, 2026-02-23) | N/A Greenfield | N/A | No -- min version + tested version | v2.87.3 (2026-02-23, [GitHub CLI Releases](https://github.com/cli/cli/releases)) | Yes | PASS |
| Node.js | 24.x LTS (24.14.0) | N/A Greenfield | N/A | No -- explicit version | 24.14.0 LTS (2026-03, [nodejs.org](https://nodejs.org/en/about/previous-releases)) | Yes | PASS |
| Claude Code Plugin | v1.1.0+ | plugin.json: "1.1.0" | Yes | No -- explicit version | 1.1.0 (codebase) | Yes | PASS |
| Git | 2.x | N/A (system) | N/A | No -- major version | Pre-installed, system dependency | Yes | PASS |
| git rerere | Git 2.x built-in | N/A | N/A | No | Built-in with Git 2.x | Yes | PASS |

**Version Check Notes:**
- All versions are explicit (no "latest" or "current" references)
- Weave CLI/Driver v0.2.3 matches the current GitHub Releases latest (released same day: 2026-03-09)
- gh CLI uses minimum-version pattern `>=2.85.0` with tested version `v2.87.3` -- appropriate for a system dependency
- Node.js 24.14.0 matches current Active LTS per nodejs.org. Architecture also notes 22.x LTS compatibility

### D2) External APIs & Services

| Dependency | Rate Limits | Auth | Errors | Timeout | Status |
|------------|-------------|------|--------|---------|--------|
| GitHub Issues API (via gh CLI) | 5000/h authenticated. Script < 10 calls per run | `gh auth login` (pre-configured). Validated via `gh auth status` check (Exit 2 on failure) | Exit 2 on CLI/auth failure. JSON.parse try/catch for foreign issues. Reporter Agent failure = Log, continue | N/A (gh CLI handles HTTP timeouts) | PASS |
| Git (local) | N/A (local tool) | N/A | Exit 2 if not in git repo. Validation Rules table covers this | N/A | PASS |
| Weave CLI (optional) | N/A (local tool) | N/A | Fallback to git diff if not installed or --weave not set. Risk documented: "Weave CLI Format aendert sich (v0.2.x)" with mitigation | N/A | PASS |

---

## E) Migration Completeness

> Scope enthaelt Migration: Orchestrator Commands werden um Phase 4b und Worktree-Support erweitert.

### Quantitaets-Check

| Discovery Claim | Architecture Coverage | Status |
|---|---|---|
| 2 Orchestrator-Commands aendern (orchestrate.md, slim-orchestrate.md) | Migration Map: 2 Zeilen (orchestrate.md, slim-orchestrate.md) | PASS |

### Qualitaets-Check

| File in Migration Map | Current Pattern | Target Pattern | Specific enough for test? | Status |
|---|---|---|---|---|
| `plugins/clemens/commands/orchestrate.md` | Phase 4 -> Phase 5 (Completion) | Phase 4 -> Phase 4b (Conflict Scan) -> Phase 5. Neuer Abschnitt "Phase 4b: Conflict Scan" mit 3 Steps einfuegen. Phase 2 State um `conflict_scan` / `conflict_report` States erweitern. Worktree-Erstellung in Phase 2 hinzufuegen. | Yes -- Test: file contains "Phase 4b", state object includes "conflict_scan", worktree creation in Phase 2 | PASS |
| `plugins/clemens/commands/slim-orchestrate.md` | Phase 4 -> Phase 5 (Completion) | Identische Aenderungen wie orchestrate.md | Yes -- Same test criteria: "Phase 4b" present, "conflict_scan" in state, worktree in Phase 2 | PASS |

**Codebase Verification:**
- `orchestrate.md` confirmed: Phase 4 (Final Validation) at line 415, Phase 5 (Completion) at line 449. Phase 4b integration point is clear.
- `slim-orchestrate.md` confirmed: Phase 4 (Final Validation) at line 447, Phase 5 (Completion) at line 480. Same integration point.
- Both files use identical Phase structure -- Architecture's "Identische Aenderungen" is accurate.

**Migration Map: 2/2 PASS, all target patterns are testable.**

---

## F) Completeness Check

| Section | Required | Present in Architecture | Status |
|---------|----------|------------------------|--------|
| Problem & Solution | Yes | Yes (lines 10-30) | PASS |
| Scope & Boundaries (In/Out) | Yes | Yes (lines 34-57) | PASS |
| API Design (CLI Interface) | Yes | Yes (lines 60-114) | PASS |
| Database Schema (JSON Schemas) | Yes | Yes (lines 117-202) | PASS |
| Server Logic (Modules & Flow) | Yes | Yes (lines 205-285) | PASS |
| Security (Auth, Data Protection, Input Validation) | Yes | Yes (lines 289-321) | PASS |
| Architecture Layers | Yes | Yes (lines 325-373) | PASS |
| Migration Map | Yes (scope includes migration) | Yes (lines 377-385) | PASS |
| Constraints & Integrations | Yes | Yes (lines 388-412) | PASS |
| Quality Attributes (NFRs) | Yes | Yes (lines 416-435) | PASS |
| Risks & Assumptions | Yes | Yes (lines 439-461) | PASS |
| Technology Decisions (Stack + Trade-offs) | Yes | Yes (lines 465-487) | PASS |
| Open Questions | Yes | Yes (line 493 -- "Keine offenen Fragen") | PASS |
| Context & Research | Yes | Yes (lines 499-541) | PASS |
| Research Log | Yes | Yes (lines 529-541) | PASS |
| Q&A Log | Yes | Yes (lines 545-552) | PASS |

**Completeness: 16/16 sections present.**

---

## G) Cross-Document Consistency Check

| Area | Discovery | Architecture | Consistent? | Status |
|------|-----------|-------------|-------------|--------|
| Weave role | Primary for Entity Extraction | Optional (`--weave` flag), git diff primary | Architecture INTENTIONALLY changed priority. Documented in Technology Decisions: "Git diff primary statt Weave: Zero dependencies, immer verfuegbar" | PASS |
| weave_validation source | "Aus weave_validate_merge" (line 356) | "Aus weave-cli preview Output geparst" (line 162) + "Kein separater weave_validate_merge Befehl" (line 177) | Architecture CORRECTS Discovery's reference to non-existent command. Documented in weave_validation Herleitung section | PASS |
| weave_validation required? | "Yes" (Discovery line 356) | Object/null, null when --weave not used (line 162) | Architecture makes it nullable because Weave is optional. Consistent with --weave flag design | PASS |
| Language count | "16 Sprachen" (Discovery lines 35, 309) | "17 Sprachen" (Architecture lines 406, 504) | Architecture more accurate per Weave v0.2.3 release notes (17 languages listed explicitly). Minor Discovery imprecision, not blocking | PASS |
| Script + Agent architecture | Two-component table (Discovery line 26-29) | Identical split: conflict-scanner.js (Script) + conflict-reporter (Sub-Agent) | Fully consistent | PASS |
| Pipeline flow (3 Steps) | Step 1 Bash, Step 2 Task(), Step 3 Label (Discovery lines 116-157) | Step 1 Bash, Step 2 Task() (Exit 1 only), Step 3 Label (Architecture Data Flow lines 340-361) | Fully consistent | PASS |
| Exit codes | 0/1/2 (Discovery line 132) | 0/1/2 with meanings table (Architecture lines 81-85) | Fully consistent | PASS |
| claims.json schema | 9 fields (Discovery lines 326-337) | 9 fields (Architecture lines 130-142) | Field names, types, constraints all match | PASS |
| overlap-report.json schema | 17 fields (Discovery lines 339-357) | 21 fields (Architecture lines 144-171) -- Architecture adds summary.files_changed, summary.entities_changed, summary.new_files, weave_validation sub-fields | Architecture is a SUPERSET of Discovery. All Discovery fields present, plus additional detail. No fields missing | PASS |
| GitHub Issue Body format | Markdown with Session + Entity Claims JSON blocks (Discovery lines 169-216) | Same format (Architecture lines 179-202) | Fully consistent | PASS |
| Business Rules | 14 rules (Discovery lines 307-319) | All 14 rules addressed across Architecture sections (Constraints, Error Handling, Data Flow, Quality Attributes) | Fully consistent | PASS |
| Slice structure | 4 slices with dependency graph (Discovery lines 375-399) | Not repeated in Architecture (Architecture focuses on technical design, not slice planning) | Expected -- slice planning belongs to Discovery/Planner, not Architecture | PASS |

**Cross-Document Consistency: 12/12 PASS**

---

## Blocking Issues

None.

---

## Recommendations

1. **[INFO]** Discovery says "16 Sprachen" for Weave/Tree-sitter support (lines 35, 309), Architecture says "17 Sprachen" (lines 406, 504) and lists all 17 explicitly. Architecture is more accurate per Weave v0.2.3 release notes. Consider updating Discovery for consistency, but not blocking.

2. **[INFO]** Discovery's Data Table (line 356) references `weave_validate_merge` as the source for `weave_validation`, but this command does not exist in Weave CLI. Architecture correctly resolves this by documenting that the data comes from `weave-cli preview` output parsing (lines 173-177). Consider updating Discovery to remove the incorrect reference.

3. **[INFO]** Architecture documents `pipeline:running` and `pipeline:merge-ready` labels in the automated flow. Discovery also defines `pipeline:merged` and `pipeline:merge-failed` labels for the manual merge step. Architecture correctly omits these from its scope (manual merge is out of scope), but the full label set could be listed as reference in the GitHub Issue API section for completeness.

4. **[INFO]** Weave CLI documentation does not show a `--json` flag for `weave-cli preview`. Architecture's Research Log correctly notes "No --json flag documented" (line 533). The text-parsing approach documented in Entity Extraction Strategy is the right solution given this limitation.

---

## Verdict

**Status:** APPROVED

**Blocking Issues:** 0
**Warnings:** 0

**Previous Run:**
- Previous compliance check (2026-03-09) found 3 blocking issues
- All 3 have been resolved in the current architecture.md:
  1. weave_validation added to overlap-report.json schema (lines 162-165) with sub-fields and Herleitung section (lines 173-177)
  2. gh CLI version updated to ">=2.85.0 (tested: v2.87.3, 2026-02-23)" (line 408)
  3. weave_validate_merge reference clarified: "Kein separater weave_validate_merge Befehl -- alles aus weave-cli preview abgeleitet" (line 177)

**Next Steps:**
- [x] All blocking issues from previous run resolved
- [ ] Proceed to Slice Planning (Gate 2)

Sources (Dependency Verification):
- [Weave Releases](https://github.com/Ataraxy-Labs/weave/releases) -- v0.2.3 (2026-03-09)
- [Weave Documentation](https://ataraxy-labs.github.io/weave/) -- CLI commands reference
- [GitHub CLI Releases](https://github.com/cli/cli/releases) -- v2.87.3 (2026-02-23)
- [Node.js Releases](https://nodejs.org/en/about/previous-releases) -- 24.14.0 LTS (2026-03)
- [GitHub Issue Body Limit](https://github.com/orgs/community/discussions/27190) -- 65536 chars
