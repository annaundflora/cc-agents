# E2E Checklist: Conflict-Aware Agent Pipeline

**Integration Map:** `integration-map.md`
**Generated:** 2026-03-09

---

## Pre-Conditions

- [ ] All 7 slices APPROVED (Gate 2) — compliance-slice-01 through compliance-slice-07
- [ ] Architecture APPROVED (Gate 1) — compliance-architecture.md
- [ ] Integration Map: Missing Inputs == 0
- [ ] Integration Map: VERDICT == READY FOR ORCHESTRATION
- [ ] Runtime prerequisites available:
  - [ ] `git` installed and `git auth` accessible
  - [ ] `gh` CLI installed and authenticated (`gh auth status`)
  - [ ] `node` available (Node.js 22.x or 24.x LTS)
  - [ ] Test repository available (owner/repo with Issues enabled)
  - [ ] (Optional) `weave-cli` installed for `--weave` flag tests

---

## Happy Path Tests

### Flow A: First-Time Repo Setup (Slice 01 Artifacts)

1. [ ] **Slice 01:** Verify `plugins/clemens/templates/weave-setup.md` exists and contains all sections
2. [ ] **Slice 01:** Verify `plugins/clemens/templates/gitattributes-weave.template` exists and contains `merge=weave` entry
3. [ ] **Slice 01:** Open `weave-setup.md` — confirm Rust/Cargo, weave-cli, weave-driver, gh CLI install commands present
4. [ ] **Slice 01:** Confirm `git config rerere.enabled true` command appears in weave-setup.md
5. [ ] **Slice 01:** Confirm `weave-cli setup` command appears in the repo setup section
6. [ ] **Slice 01:** Confirm `gitattributes-weave.template` has funcname patterns for `*.ts`, `*.tsx`, `*.py`, `*.go`
7. [ ] **Slice 01:** Confirm a verification step (e.g. `weave-cli setup --dry-run`) is documented in weave-setup.md

### Flow B: New Pipeline Start — Worktree Creation (Slice 04)

1. [ ] **Slice 04:** Open `plugins/clemens/commands/orchestrate.md` — confirm Worktree-Block exists after State-Init block
2. [ ] **Slice 04:** Confirm Worktree-Block is positioned before `## Phase 2b` header
3. [ ] **Slice 04:** Confirm block contains `git worktree add worktrees/{feature_name} -b feature/{feature_name}`
4. [ ] **Slice 04:** Confirm block writes `worktree_path` and `branch` to state object
5. [ ] **Slice 04:** Confirm block contains an existence check before `git worktree add` (no duplicate worktree creation)
6. [ ] **Slice 04:** Open `plugins/clemens/commands/slim-orchestrate.md` — confirm identical Worktree-Block present
7. [ ] **Slice 04:** Confirm Phase 5 in both command files contains `git worktree remove worktrees/{feature_name}` and `git worktree prune`

### Flow C: Conflict-Scanner — Entity Extraction and Claims (Slice 02)

1. [ ] **Slice 02:** Verify `plugins/clemens/scripts/conflict-scanner.js` exists
2. [ ] **Slice 02 (AC-1):** Run script without arguments — confirm exit code 2 and stderr listing missing args
3. [ ] **Slice 02 (AC-2):** Run with `--repo notvalid` (no slash) — confirm exit code 2 and stderr "Invalid repo format: expected owner/repo"
4. [ ] **Slice 02 (AC-2):** Run with `--spec-path /nonexistent` — confirm exit code 2 and stderr "Spec path not found"
5. [ ] **Slice 02 (AC-3):** Mock git diff output with hunk header `@@ -42,10 +42,15 @@ function PromptArea() {` — run script — confirm `claims.json` has entry with `entity: "PromptArea"`, `entity_type: "function"`, `lines: [42, 52]`
6. [ ] **Slice 02 (AC-3):** Mock hunk header `@@ -10,5 +15,5 @@ class UserService {` — confirm `entity_type: "class"` and `entity: "UserService"`
7. [ ] **Slice 02 (AC-4):** Mock hunk header `@@ -10,5 +10,5 @@` (no funcname) — confirm `entity: null`, `entity_type: "unknown"`, no exit code 2
8. [ ] **Slice 02 (AC-5):** Mock new file diff — confirm `entity: null`, `entity_type: "new_file"`, `summary.new_files` incremented
9. [ ] **Slice 02 (AC-6):** Run successful parse — confirm `claims.json` is valid JSON with `entities_changed[]`, `summary.files_changed`, `summary.entities_changed`, `summary.new_files`
10. [ ] **Slice 02 (AC-7, optional):** With `weave-cli` in PATH and `--weave` flag — confirm Weave output used as primary entity source
11. [ ] **Slice 02 (AC-8):** Set `--weave` flag but ensure `weave-cli` is NOT in PATH — confirm fallback to git diff, no exit code 2, stderr warning present

### Flow D: Conflict-Scanner — GitHub Registry, Overlap, and Report (Slice 03)

1. [ ] **Slice 03 (AC-1):** Mock unavailable `gh` CLI — confirm exit code 2 and stderr "GitHub CLI not authenticated"
2. [ ] **Slice 03 (AC-2):** Mock authenticated `gh` — run script — confirm `gh issue create` called with title `"Pipeline: {feature}"`, label `"pipeline:running"`, body containing `## Session` and `## Entity Claims` JSON blocks
3. [ ] **Slice 03 (AC-3):** Mock `gh issue list` returning 2 issues — one with valid JSON body, one with corrupt JSON — confirm valid issue is parsed, corrupt issue is skipped with stderr warning `"Skipping issue #N: invalid JSON"`, no exit code 2
4. [ ] **Slice 03 (AC-4):** Provide two sessions both claiming `entity: "PromptArea"` in `file: "components/prompt-area.tsx"` — confirm `overlaps[]` entry with `overlap_type: "same_entity"`, `severity: "high"`
5. [ ] **Slice 03 (AC-5):** Provide two sessions with different entities in same file — confirm `overlaps[]` entry with `overlap_type: "same_file_different_entity"`, `severity: "low"`
6. [ ] **Slice 03 (AC-6):** With high-severity overlap — confirm `overlap-report.json` written, valid JSON, all required fields present, `summary.max_severity: "high"`
7. [ ] **Slice 03 (AC-7):** No overlaps — confirm exit code 0 and JSON summary on stdout
8. [ ] **Slice 03 (AC-8):** With overlaps — confirm exit code 1 and JSON summary on stdout
9. [ ] **Slice 03 (AC-9):** With `--weave` and available `weave-cli` — confirm `weave_validation` is object with `auto_resolvable`, `conflict_entities`, `confidence`; without `--weave` — confirm `weave_validation: null`

### Flow E: Conflict-Reporter Sub-Agent (Slice 05)

1. [ ] **Slice 05 (AC-1):** Open `plugins/clemens/agents/conflict-reporter.md` — confirm all 4 required blocks: Task-Context, Comment-Format, gh issue comment instructions, JSON-Output-Schema
2. [ ] **Slice 05 (AC-2):** Invoke agent via `Task("conflict-reporter", { overlap_report_path: "...", own_issue_number: 42, repo: "owner/repo" })` — confirm agent reads file via Read-Tool, not Bash cat
3. [ ] **Slice 05 (AC-3):** Provide overlap-report.json with `severity: "high"` entry — confirm comment contains Markdown table with columns: Datei, Entity, Diese Session, Konflikt mit, Andere Session — plus `**Kontext:**` and `**Empfehlung:**` sections
4. [ ] **Slice 05 (AC-4):** With `weave_validation.auto_resolvable: false` — confirm comment contains "Manueller Review empfohlen" and note that Weave cannot auto-merge this entity
5. [ ] **Slice 05 (AC-5):** With `weave_validation.auto_resolvable: true` — confirm comment contains "Weave löst automatisch" and no escalation language
6. [ ] **Slice 05 (AC-6):** With `own_issue_number: 42` and `overlaps[0].their_issue: 47` — confirm two `gh issue comment` Bash calls: one for issue 42, one for issue 47, both containing `@{their_user}`
7. [ ] **Slice 05 (AC-7):** Confirm output JSON has exactly: `status`, `commented`, `issues_commented` (Integer array), `notes`
8. [ ] **Slice 05 (AC-8):** Mock `gh issue comment` failure — confirm output `{ status: "failed", commented: false, notes: "... error cause ..." }` — agent does not abort without returning output

### Flow F: Orchestrator Phase 4b Integration (Slice 06)

1. [ ] **Slice 06 (AC-1):** Confirm Phase-4b-Block in `orchestrate.md` appears after `## Phase 4` and before `## Phase 5`
2. [ ] **Slice 06 (AC-2):** Confirm identical positioning in `slim-orchestrate.md`
3. [ ] **Slice 06 (AC-3):** Confirm Step 1 contains `node {plugin_path}/scripts/conflict-scanner.js --branch {state.branch} --spec-path {state.spec_path} --repo {repo}` and stores exit code in a variable
4. [ ] **Slice 06 (AC-4):** Confirm Step 2 (Exit 1 path) calls `Task("conflict-reporter", { overlap_report_path: "{state.spec_path}/overlap-report.json", own_issue_number: ..., repo: ... })`, parses output via `parse_agent_json()`, sets `state.current_state = "conflict_report"`
5. [ ] **Slice 06 (AC-5):** Confirm Exit 0 path: no Task() call, `state.current_state = "conflict_scan"`, proceeds to Step 3
6. [ ] **Slice 06 (AC-6):** Confirm Exit 2 path: Warning logged with stderr content (`"Conflict scan failed: {stderr}"`), no state change, proceeds to Step 3 (non-blocking)
7. [ ] **Slice 06 (AC-7):** Confirm Step 3 always runs (Exit 0, 1, and 2): `gh issue edit {own_issue_number} --repo {repo} --remove-label pipeline:running --add-label pipeline:merge-ready`
8. [ ] **Slice 06 (AC-8):** Confirm state block in both command files documents `"conflict_scan"` and `"conflict_report"` as valid `current_state` values

### Flow G: Plugin Manifest Registration (Slice 07)

1. [ ] **Slice 07 (AC-1):** Open `plugins/clemens/.claude-plugin/plugin.json` — confirm `name`, `description`, `version`, `author` keys unchanged
2. [ ] **Slice 07 (AC-2):** `JSON.parse()` the file — confirm no exception
3. [ ] **Slice 07 (AC-3):** Confirm `scripts` key exists and contains entry `"scripts/conflict-scanner.js"`
4. [ ] **Slice 07 (AC-4):** Confirm the path in `scripts` matches actual file path of `plugins/clemens/scripts/conflict-scanner.js` (relative to plugin root)

---

## Edge Cases

### Error Handling

- [ ] Script exit code 2 (gh not available) — Orchestrator logs warning, Phase 4b Step 3 still attempted (best-effort label set), pipeline reaches Phase 5
- [ ] Script exit code 2 — `overlap-report.json` NOT written (AC-1 Slice 03: file not created on auth failure)
- [ ] Corrupt JSON in foreign GitHub Issue body — Script skips it with stderr warning, does NOT exit with code 2 (AC-3 Slice 03)
- [ ] Reporter Agent fails (`status: "failed"`) — Orchestrator logs warning and continues to Step 3 (label set), pipeline non-blocking (Slice 06 Constraints)
- [ ] Worktree already exists (resume scenario) — `git worktree add` NOT re-executed, existence check passes (AC-4 Slice 04)
- [ ] `--weave` flag set but `weave-cli` not in PATH — fallback to git diff, no error, stderr warning (AC-8 Slice 02)

### State Transitions

- [ ] `initial` -> Worktree created -> `current_state` has `worktree_path` and `branch` set
- [ ] Phase 4 completes -> Phase 4b entered -> Exit 0 -> `state.current_state = "conflict_scan"` -> Phase 5
- [ ] Phase 4 completes -> Phase 4b entered -> Exit 1 -> Reporter runs -> `state.current_state = "conflict_report"` -> Phase 5
- [ ] Phase 4 completes -> Phase 4b entered -> Exit 2 -> Warning -> State unchanged -> Phase 5

### Boundary Conditions

- [ ] Zero overlaps (overlaps[] empty) — `summary.max_severity: "none"`, exit code 0
- [ ] 50+ entities changed — claims.json capped at Top-50 entities (architecture.md Risks mitigation)
- [ ] Multiple `their_issue` values (multiple parallel sessions with overlap) — Reporter Agent comments on ALL of them (AC-6 Slice 05: "je einen fuer jede eindeutige their_issue-Nummer")
- [ ] Hunk header with no funcname (`@@ ... @@` only) — `entity: null`, `entity_type: "unknown"`, overlap detection only at file-level
- [ ] `weave_validation: null` (--weave not used) — Reporter omits Weave-specific statements in recommendation (AC-4 Slice 05)

---

## Cross-Slice Integration Points

| # | Integration Point | Slices | How to Verify |
|---|-------------------|--------|---------------|
| 1 | claims.json written by Slice 02, consumed by Slice 03 | 02 -> 03 | After Slice 02 completes: confirm `{spec-path}/claims.json` is valid JSON with correct schema; Slice 03 reads and processes it |
| 2 | conflict-scanner.js extended by Slice 03 (additive) | 02 -> 03 | Final file contains all 7 modules (CLI Parser, Entity Extractor, Claims Writer, Session Registry, Overlap Calculator, Report Writer, Exit Handler) |
| 3 | overlap-report.json written by Slice 03, consumed by Slice 05 (Agent) | 03 -> 05 | After Slice 03 completes: confirm `{spec-path}/overlap-report.json` has all required fields; Agent reads at `overlap_report_path` |
| 4 | GitHub Issue created by Slice 03, issue number consumed by Slice 05 and Slice 06 | 03 -> 05, 06 | Script stdout contains own_issue_number; Orchestrator parses it; Agent uses it for comments |
| 5 | conflict-reporter.md created by Slice 05, invoked by Slice 06 | 05 -> 06 | Phase 4b Step 2 calls `Task("conflict-reporter", ...)` — confirm agent name matches filename |
| 6 | state.branch set by Slice 04, used by Slice 06 as `--branch` arg | 04 -> 06 | Phase 4b Step 1 Bash call uses `{state.branch}` from state set in Phase 2 |
| 7 | state.spec_path (pre-existing) used by Slice 06 as `--spec-path` arg | 04/pre-existing -> 06 | Phase 4b Step 1 Bash call uses `{state.spec_path}` from existing Orchestrator State |
| 8 | orchestrate.md modified by both Slice 04 (Phase 2) and Slice 06 (Phase 4b) | 04 -> 06 | Confirm no content conflict: Worktree-Block in Phase 2, Phase-4b-Block between Phase 4 and 5 |
| 9 | plugin.json references conflict-scanner.js path from Slice 02 | 02 -> 07 | `scripts/conflict-scanner.js` in plugin.json matches `plugins/clemens/scripts/conflict-scanner.js` |

---

## Full E2E Smoke Test (after all slices implemented)

Run this sequence against a real test repository:

1. [ ] Start pipeline: Orchestrator enters Phase 2
2. [ ] Confirm worktree created at `worktrees/{feature}/` with branch `feature/{feature}`
3. [ ] Confirm `state.branch` and `state.worktree_path` visible in `.orchestrator-state.json`
4. [ ] Orchestrator completes Phase 4 (Final Validation)
5. [ ] Orchestrator enters Phase 4b — executes `node conflict-scanner.js --branch ... --spec-path ... --repo ...`
6. [ ] Confirm `claims.json` written to `{spec-path}/claims.json`
7. [ ] Confirm GitHub Issue created with label `pipeline:running`
8. [ ] Confirm `overlap-report.json` written to `{spec-path}/overlap-report.json`
9. [ ] If exit 0: Confirm `state.current_state = "conflict_scan"`, no Task() call, Step 3 runs
10. [ ] If exit 1: Confirm Reporter Agent called, comments posted to both GitHub Issues, `state.current_state = "conflict_report"`, Step 3 runs
11. [ ] Confirm GitHub Issue label changed from `pipeline:running` to `pipeline:merge-ready`
12. [ ] Orchestrator enters Phase 5 — confirm cleanup hint present (`git worktree remove`, `git worktree prune`)
13. [ ] Confirm `plugin.json` has `scripts: ["scripts/conflict-scanner.js"]` — Slice 07 verified

---

## Sign-Off

| Tester | Date | Result |
|--------|------|--------|
| — | 2026-03-09 | Pending implementation |

**Notes:**
All tests are designed for manual verification or simple Node.js built-in based scripts (no framework). The conflict-scanner.js tests can be run with mock fixtures for git diff output and gh CLI responses by temporarily replacing the external binaries with stub scripts that return known outputs.
