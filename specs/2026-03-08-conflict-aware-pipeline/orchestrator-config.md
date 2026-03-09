# Orchestrator Configuration: Conflict-Aware Agent Pipeline

**Integration Map:** `integration-map.md`
**E2E Checklist:** `e2e-checklist.md`
**Generated:** 2026-03-09

---

## Pre-Implementation Gates

```yaml
pre_checks:
  - name: "Gate 1: Architecture Compliance"
    file: "specs/2026-03-08-conflict-aware-pipeline/compliance-architecture.md"
    required: "Verdict == APPROVED"
    status: "APPROVED (2026-03-09)"

  - name: "Gate 2: All Slices Approved"
    files: "specs/2026-03-08-conflict-aware-pipeline/slices/compliance-slice-*.md"
    required: "ALL Verdict == APPROVED"
    status: "APPROVED — 7/7 slices (2026-03-09)"

  - name: "Gate 3: Integration Map Valid"
    file: "specs/2026-03-08-conflict-aware-pipeline/integration-map.md"
    required: "VERDICT == READY FOR ORCHESTRATION"
    status: "READY FOR ORCHESTRATION (2026-03-09)"
```

---

## Implementation Order

Based on dependency analysis from `integration-map.md`:

| Order | Slice | Name | Depends On | Parallel With | Notes |
|-------|-------|------|------------|---------------|-------|
| 1 | slice-01 | Weave + rerere Setup-Artifacts | — | slice-02 | Foundation: templates only. No code. |
| 1 | slice-02 | Conflict-Scanner: Entity-Extraktion & Claims | — | slice-01 | Foundation: Node.js script Phase 1. |
| 2 | slice-03 | Conflict-Scanner: GitHub Registry, Overlap & Report | slice-02 | slice-04 | Extends conflict-scanner.js with 4 modules. |
| 2 | slice-04 | Worktree-Erstellung in Orchestrator Phase 2 | slice-01 | slice-03 | Modifies orchestrate.md + slim-orchestrate.md. |
| 3 | slice-05 | Conflict-Reporter Sub-Agent | slice-03 | slice-07 | New agent definition file. |
| 3 | slice-07 | Script-Verzeichnis Plugin-Registration | slice-02 | slice-05 | Modifies plugin.json. |
| 4 | slice-06 | Orchestrator Phase 4b Integration | slice-04, slice-05 | — | Final integration. Depends on both Slice 04 and 05. |

### Parallelism Notes

- **Wave 1 (parallel):** slice-01 and slice-02 have no dependencies and can be implemented simultaneously.
- **Wave 2 (parallel):** slice-03 (requires slice-02 complete) and slice-04 (requires slice-01 complete) can run simultaneously once their respective Wave 1 prerequisites are done.
- **Wave 3 (parallel):** slice-05 (requires slice-03 complete) and slice-07 (requires slice-02 complete — already done in Wave 1) can run simultaneously.
- **Wave 4 (sequential):** slice-06 requires both slice-04 and slice-05 complete. Must run last.

### File Modification Schedule (Conflict Prevention)

| File | Modified By | Wave | Modification Type |
|------|------------|------|-------------------|
| `plugins/clemens/templates/weave-setup.md` | slice-01 | 1 | NEW |
| `plugins/clemens/templates/gitattributes-weave.template` | slice-01 | 1 | NEW |
| `plugins/clemens/scripts/conflict-scanner.js` | slice-02 | 1 | NEW (Phase 1: 3 modules) |
| `plugins/clemens/scripts/conflict-scanner.js` | slice-03 | 2 | EXTEND (+ 4 modules) |
| `plugins/clemens/commands/orchestrate.md` | slice-04 | 2 | MODIFY (Phase 2 + Phase 5) |
| `plugins/clemens/commands/slim-orchestrate.md` | slice-04 | 2 | MODIFY (Phase 2 + Phase 5) |
| `plugins/clemens/agents/conflict-reporter.md` | slice-05 | 3 | NEW |
| `plugins/clemens/.claude-plugin/plugin.json` | slice-07 | 3 | MODIFY (+ scripts key) |
| `plugins/clemens/commands/orchestrate.md` | slice-06 | 4 | MODIFY (Phase 4b + state comments) |
| `plugins/clemens/commands/slim-orchestrate.md` | slice-06 | 4 | MODIFY (Phase 4b + state comments) |

**IMPORTANT:** `orchestrate.md` and `slim-orchestrate.md` are modified by both slice-04 (Wave 2) and slice-06 (Wave 4). These are in separate waves — no parallel conflict risk. slice-06 must implement Phase 4b AFTER slice-04 has added the Worktree-Block in Phase 2, because slice-06 depends on `state.branch` being available.

---

## Post-Slice Validation

For each completed slice:

```yaml
validation_steps:

  slice-01:
    - step: "Deliverables Check"
      action: "Verify both files exist"
      files:
        - "plugins/clemens/templates/weave-setup.md"
        - "plugins/clemens/templates/gitattributes-weave.template"
    - step: "Content Checks"
      action: "Run e2e-checklist.md Flow A items 1-7"

  slice-02:
    - step: "Deliverables Check"
      action: "Verify file exists"
      files:
        - "plugins/clemens/scripts/conflict-scanner.js"
    - step: "Script Validation"
      action: "node plugins/clemens/scripts/conflict-scanner.js"
      expected: "Exit code 2 with stderr listing missing args"
    - step: "Unit Checks"
      action: "Run e2e-checklist.md Flow C items 1-11"
    - step: "Integration Points"
      action: "Verify conflict-scanner.js contains CLI Parser, Entity Extractor, Claims Writer modules"

  slice-03:
    - step: "Deliverables Check"
      action: "conflict-scanner.js extended — verify 7 modules present (4 new on top of Slice 02's 3)"
    - step: "Unit Checks"
      action: "Run e2e-checklist.md Flow D items 1-9"
    - step: "Integration Points"
      action: |
        Verify conflict-scanner.js produces:
        - {spec-path}/claims.json (for Slice 05 Agent)
        - {spec-path}/overlap-report.json (for Slice 05 Agent)
        - Exit code 0 or 1 with JSON summary on stdout (for Slice 06 Orchestrator)
        - Exit code 2 on error (for Slice 06 non-blocking path)

  slice-04:
    - step: "Deliverables Check"
      action: "Verify both files were modified"
      files:
        - "plugins/clemens/commands/orchestrate.md"
        - "plugins/clemens/commands/slim-orchestrate.md"
    - step: "Content Checks"
      action: "Run e2e-checklist.md Flow B items 1-7"
    - step: "Integration Points"
      action: |
        Verify in both command files:
        - Worktree-Block present in Phase 2 (after State-Init, before Phase 2b)
        - state.branch and state.worktree_path documented as state fields
        - Phase 5 contains cleanup commands (git worktree remove + prune)

  slice-05:
    - step: "Deliverables Check"
      action: "Verify file exists"
      files:
        - "plugins/clemens/agents/conflict-reporter.md"
    - step: "Content Checks"
      action: "Run e2e-checklist.md Flow E items 1-8 (manual review)"
    - step: "Integration Points"
      action: |
        Verify agent-definition interface matches Task() contract:
        - Input: overlap_report_path, own_issue_number, repo
        - Output: { status, commented, issues_commented, notes }
        - This matches Slice 06 AC-4 Task() call signature

  slice-07:
    - step: "Deliverables Check"
      action: "Verify file was modified"
      files:
        - "plugins/clemens/.claude-plugin/plugin.json"
    - step: "JSON Validation"
      action: "node -e \"const p = require('./plugins/clemens/.claude-plugin/plugin.json'); if (!p.scripts) process.exit(1)\""
      expected: "Exit code 0"
    - step: "Content Checks"
      action: "Run e2e-checklist.md Flow G items 1-4"

  slice-06:
    - step: "Deliverables Check"
      action: "Verify both command files contain Phase 4b block"
    - step: "Content Checks"
      action: "Run e2e-checklist.md Flow F items 1-8"
    - step: "Integration Points"
      action: |
        Verify Phase 4b in both command files:
        - Step 1: node conflict-scanner.js call with correct args from state
        - Step 2: Task("conflict-reporter") only on exit code 1
        - Step 3: gh issue edit always runs
        - state.current_state updated correctly per exit code
```

---

## E2E Validation

AFTER all slices completed:

```yaml
e2e_validation:
  - step: "Run Full E2E Smoke Test"
    action: "Execute e2e-checklist.md section: Full E2E Smoke Test (items 1-13)"
    reference: "e2e-checklist.md"

  - step: "Run Cross-Slice Integration Points"
    action: "Execute e2e-checklist.md section: Cross-Slice Integration Points (items 1-9)"
    reference: "e2e-checklist.md"

  - step: "Run Edge Case Tests"
    action: "Execute e2e-checklist.md section: Edge Cases (all items)"
    reference: "e2e-checklist.md"

  - step: "FOR each failing check"
    actions:
      - "Identify responsible slice from integration-map.md Connections table"
      - "Create fix task referencing the specific slice and AC"
      - "Re-run that slice's post-slice validation after fix"
      - "Re-run full E2E smoke test"

  - step: "Final Approval"
    condition: "ALL checks in e2e-checklist.md PASS"
    output: "Feature conflict-aware-pipeline READY for merge"
```

---

## Rollback Strategy

IF implementation fails:

```yaml
rollback:
  - condition: "Slice 01 fails"
    action: "Delete plugins/clemens/templates/weave-setup.md and gitattributes-weave.template"
    note: "No downstream impact — no other slice has been implemented yet at Wave 1"

  - condition: "Slice 02 fails"
    action: "Delete plugins/clemens/scripts/conflict-scanner.js"
    note: "No downstream impact at Wave 1. Do NOT proceed to Slice 03 or 07."

  - condition: "Slice 03 fails"
    action: "Revert conflict-scanner.js to Slice 02 state (remove Session Registry, Overlap Calculator, Report Writer, Exit Handler modules)"
    note: "Slice 02 base remains intact. Do NOT proceed to Slice 05."
    how: "Restore from git diff — Slice 02 created the file, Slice 03 extends it"

  - condition: "Slice 04 fails"
    action: "Revert orchestrate.md and slim-orchestrate.md to pre-Slice-04 state"
    note: "Remove Worktree-Block from Phase 2 and Cleanup-Hint from Phase 5. Do NOT proceed to Slice 06."

  - condition: "Slice 05 fails"
    action: "Delete plugins/clemens/agents/conflict-reporter.md"
    note: "No impact on Slice 06 until it is implemented. Do NOT proceed to Slice 06."

  - condition: "Slice 07 fails"
    action: "Revert plugin.json to remove scripts key"
    note: "Isolated change. No impact on other slices."

  - condition: "Slice 06 fails"
    action: "Revert orchestrate.md and slim-orchestrate.md to post-Slice-04 state (remove Phase 4b block and state comments)"
    note: "Slices 01-05 and 07 remain intact. Slice 06 is the only Wave 4 slice."

  - condition: "E2E integration fails after all slices"
    action: "Review integration-map.md Connections table to identify which integration point broke"
    note: "Most likely: state field naming mismatch, file path mismatch, or JSON schema mismatch between script output and agent/orchestrator consumer"
```

---

## Monitoring

During implementation:

| Metric | Alert Threshold | Action |
|--------|-----------------|--------|
| Slice implementation time | > 2x expected (template slices ~15min, code slices ~45min) | Review scope — may be scope creep |
| Test failures (AC violations) | Any failing AC | Do not mark slice complete, fix before proceeding |
| Missing deliverable file | Any | Slice is incomplete — do not advance to next wave |
| JSON schema mismatch (claims.json, overlap-report.json) | Any field missing or wrong type | Fix in the responsible slice before integration |
| conflict-scanner.js exit code unexpected | Any unexpected code during E2E | Check error handling in Slice 03 Session Registry |
| Reporter Agent no output / wrong JSON | Any | Check JSON-Output-Schema compliance (Slice 05 AC-7) |
| orchestrate.md Phase 4b position wrong | After Phase 5 or before Phase 4 | Fix Slice 06 — critical integration point |

---

## Key Integration Risk Areas

Based on the integration map, these are the highest-risk integration points to watch during implementation:

| Risk Area | Why | Mitigation |
|-----------|-----|------------|
| `state.spec_path` availability | Slice 06 uses `state.spec_path` as `--spec-path` arg but Slice 04 only explicitly documents `state.branch` and `state.worktree_path` as new fields | `spec_path` is a pre-existing Orchestrator State field. Verify it exists in the current `.orchestrator-state.json` schema before Slice 06 implementation. |
| `own_issue_number` extraction | Slice 06 AC-3/4/7 require parsing the GitHub Issue number from script stdout. The extraction mechanism must be consistent. | Verify conflict-scanner.js (Slice 03) writes issue number to stdout JSON summary. Slice 06 implementer must read this contract carefully. |
| conflict-scanner.js additive extension | Slice 03 extends Slice 02's file — the extension must not break Slice 02's 3 existing modules | Implement as append/refactor, not rewrite. All Slice 02 ACs must still pass after Slice 03 completes. |
| orchestrate.md modified twice | Slice 04 (Wave 2) and Slice 06 (Wave 4) both modify same file | Enforce sequential implementation. Slice 06 implementer must read the Slice-04-modified version before adding Phase 4b. |
