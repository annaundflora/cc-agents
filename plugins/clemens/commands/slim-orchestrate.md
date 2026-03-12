---
description: "Slim Orchestrator: Task-Driven Implementation Pipeline. Nutzt slim-slice-implementer + slim-code-reviewer (AC-basiert statt Code-Example-basiert). Gleiche 6-Step Pipeline, JSON-Parsing, 9 Retries."
---

# Slim Orchestrate Feature Implementation

Du orchestrierst die Implementierung eines Features slice-by-slice mit Sub-Agent Pipeline.

**UNTERSCHIED zum Standard-Orchestrator:** Nutzt `slim-slice-implementer` und `slim-code-reviewer` die gegen ACs + Architecture prüfen statt gegen Code-Examples.

**KRITISCHE REGELN (KEINE Ausnahmen):**
1. **Autonomer Betrieb:** Frage NIEMALS zwischen Waves oder Slices nach Bestätigung.
2. **Exit Code ist Wahrheit:** exit_code != 0 = FEHLGESCHLAGEN. Immer.
3. **Reiner Orchestrator:** Du benutzt NIEMALS Read/Edit/Write auf Projekt-Code. Fixes IMMER via Task(). Einzige Bash-Ausnahme: Lint/TypeCheck-Commands ausführen (NICHT fixen).
4. **JSON-Parsing:** Jeder Sub-Agent-Output wird als JSON geparsed (letzter ```json``` Block). Bei Parse-Failure: HARD STOP.
5. **9 Retries:** Max 9 Debugger-Retries pro Slice, max 3 Code-Review-Retries, max 3 Lint/TypeCheck-Retries. Danach HARD STOP.
6. **Code Review ist binär:** APPROVED = weiter, REJECTED = fix. Bei parallelen Reviews: JEDES Ergebnis einzeln prüfen. REJECTED Slices fixen bevor die Wave weitergeht.

**Input:** $ARGUMENTS (Spec-Pfad)

---

## Phase 1: Input-Validierung & Pre-Impl Sanity Check

```
1. Prüfe ob $ARGUMENTS einen Spec-Pfad enthält
2. Falls kein Argument: Suche neuestes specs/*/orchestrator-config.md

3. Validiere Required Outputs:
   REQUIRED:
   - {spec_path}/orchestrator-config.md
   - {spec_path}/slices/slice-*.md
   - {spec_path}/slices/compliance-slice-*.md (MUSS "APPROVED" enthalten)

   IF ANY REQUIRED MISSING OR NOT APPROVED:
     HARD STOP: "Planner muss zuerst laufen."

4. Parse orchestrator-config.md
```

---

## Phase 1b: Dependency Pre-Flight Check

```
# Stack-agnostische Dependency-Validierung

dependency_files = {
  "package.json":        "npm install / pnpm install",
  "requirements.txt":    "pip install -r requirements.txt",
  "pyproject.toml":      "pip install -e . / poetry install",
  "go.mod":              "go mod download",
  "Cargo.toml":          "cargo check",
  "Gemfile":             "bundle install",
}

FOR each (file, install_cmd) IN dependency_files:
  locations = Glob("**/{file}", exclude=["node_modules", ".venv", "vendor"])
  FOR each location IN locations:
    dir = dirname(location)

    result = Bash("{install_cmd}", cwd=dir)
    IF result.exit_code != 0:
      HARD STOP: "Dependency install failed in {dir}."

    IF file == "package.json":
      Bash("npx tsc --noEmit 2>&1 | head -20", cwd=dir)
    ELIF file in ["requirements.txt", "pyproject.toml"]:
      deps = parse_dependencies(location)
      FOR each dep IN deps:
        Bash("python -c 'import {dep}'", cwd=dir)

IF ANY check failed:
  HARD STOP: "Dependency Pre-Flight fehlgeschlagen."
```

---

## Phase 2: Setup & State Management

```
STATE_FILE = "{spec_path}/.orchestrator-state.json"
GATE_LOG = "{spec_path}/gate-log.jsonl"
EVIDENCE_DIR = ".claude/evidence/{feature_name}/"

# Gate-Log Helper: Appends one JSON line after each gate result.
# Survives session crashes — alles bis zum letzten Gate ist persistiert.
# Bei Resume: lies GATE_LOG um bereits bestandene Gates zu überspringen.
FUNCTION log_gate(slice_id, gate, result_obj):
  line = JSON.stringify({
    "ts": ISO_TIMESTAMP,
    "slice": slice_id,
    "gate": gate,
    ...result_obj
  })
  Bash("echo '{line}' >> {GATE_LOG}")

state = {
  "spec_path": spec_path,
  "feature_name": feature_name,
  "status": "in_progress",
  # Gueltige current_state-Werte: "worktree_setup" | "pre_scan" | "pre_check" |
  #   "implementing" | "code_review" | "deterministic_gate" | "writing_tests" |
  #   "validating" | "auto_fixing" | "slice_complete" | "final_validation" |
  #   "conflict_scan" | "conflict_report" | "feature_complete"
  "current_state": "pre_check",
  "current_slice_id": null,
  "retry_count": 0,
  "failed_stage": null,
  "waves": [...],
  "completed_slices": [],
  "evidence_files": []
}

IF EXISTS STATE_FILE:
  # Resume-Logik
  # Lies GATE_LOG falls vorhanden um bereits bestandene Gates zu kennen.
  # Format pro Zeile: {"ts":...,"slice":"slice-02","gate":"code_review","verdict":"APPROVED",...}
  # Nutze dies um Gates zu überspringen die bereits PASSED/APPROVED sind.

Write(STATE_FILE, state)
```

---

## Helper: JSON-Parsing

```
FUNCTION parse_agent_json(agent_output):
  json_blocks = regex_find_all(agent_output, /```json\s*\n(.*?)```/s)
  IF json_blocks.length == 0:
    HARD STOP: "Agent hat keinen JSON-Output geliefert"
  last_json = json_blocks[-1]
  TRY:
    parsed = JSON.parse(last_json)
    RETURN parsed
  CATCH:
    HARD STOP: "JSON Parse Failure"
```

---

## Phase 0: Worktree Setup + Pre-Scan

```
# Step 0a: Worktree erstellen oder rebasen
state.current_state = "worktree_setup"
Write(STATE_FILE, state)

worktree_check = Bash("git worktree list")
IF "worktrees/{feature_name}" IN worktree_check.output:
  rebase_result = Bash("cd worktrees/{feature_name} && git rebase main")
  IF rebase_result.exit_code != 0:
    Bash("cd worktrees/{feature_name} && git rebase --abort")
    OUTPUT: "Warning: Rebase failed, continuing on current base."
ELSE:
  worktree_result = Bash("git worktree add worktrees/{feature_name} -b feature/{feature_name}")
  IF worktree_result.exit_code != 0:
    OUTPUT: "Warning: Worktree creation failed, continuing on current branch."

state.worktree_path = "worktrees/{feature_name}"
state.branch = "feature/{feature_name}"
Write(STATE_FILE, state)

# Step 0b: Pre-Scan (Predicted Claims)
state.current_state = "pre_scan"
Write(STATE_FILE, state)

repo = Bash("gh repo view --json nameWithOwner -q .nameWithOwner").stdout.trim()
scanner_result = Task("conflict-scanner", {
  mode: "predict",
  spec_path: state.spec_path,
  repo: repo
})
scanner_json = parse_agent_json(scanner_result)

IF scanner_json.status == "completed":
  state.issue_number = scanner_json.issue_number
  IF scanner_json.has_overlap:
    OUTPUT: "⚠️ Pre-Scan: Overlap mit anderen Sessions gefunden. Advisory — Pipeline laeuft weiter."
    OUTPUT: scanner_json.notes
ELIF scanner_json.status == "failed":
  OUTPUT: "Warning: Pre-scan failed: {scanner_json.notes}. Pipeline laeuft weiter."

Write(STATE_FILE, state)
```

---

## Phase 2b: Stack Detection (läuft IMMER, auch bei Resume)

**WICHTIG:** Stack Detection wird NICHT im State gecacht. Sie läuft bei jedem Start neu,
weil sich die Projekt-Tooling zwischen Runs ändern kann (z.B. Pint installiert).

```
STACK_INDICATORS = {
  "pyproject.toml":    "Python",
  "requirements.txt":  "Python",
  "package.json":      "Node.js",
  "tsconfig.json":     "TypeScript",
  "go.mod":            "Go",
  "Cargo.toml":        "Rust",
  "composer.json":     "PHP",
  "Gemfile":           "Ruby",
  "pom.xml":           "Java/Maven",
  "build.gradle":      "Java/Gradle",
}

detected_stack = null

FOR each (file, stack_name) IN STACK_INDICATORS:
  locations = Glob("**/{file}", exclude=["node_modules", ".venv", "vendor"])
  IF locations.length > 0:
    detected_stack = {
      "stack_name": stack_name,
      "indicator_file": locations[0],
      "lint_autofix_cmd": null,
      "lint_check_cmd": null,
      "typecheck_cmd": null,
      "test_cmd": null,
    }

    IF stack_name == "TypeScript" OR stack_name == "Node.js":
      pkg = Read(locations[0])
      IF pkg.scripts.lint: detected_stack.lint_autofix_cmd = "npm run lint -- --fix"
      IF pkg.scripts.lint: detected_stack.lint_check_cmd = "npm run lint"
      IF file == "tsconfig.json" OR EXISTS "tsconfig.json":
        detected_stack.typecheck_cmd = "npx tsc --noEmit"
      detected_stack.test_cmd = "npm test"

    ELIF stack_name == "Python":
      detected_stack.lint_autofix_cmd = "ruff check --fix . 2>&1 || black . 2>&1"
      detected_stack.lint_check_cmd = "ruff check . 2>&1 || flake8 . 2>&1"
      detected_stack.typecheck_cmd = "mypy . 2>&1 || pyright . 2>&1"
      detected_stack.test_cmd = "pytest"

    ELIF stack_name == "PHP":
      # Laravel Pint (Lint/Format)
      IF EXISTS "vendor/bin/pint" OR EXISTS "pint.json":
        detected_stack.lint_autofix_cmd = "./vendor/bin/pint 2>&1"
        detected_stack.lint_check_cmd = "./vendor/bin/pint --test 2>&1"
      # PHPStan/Larastan (Static Analysis, optional)
      IF EXISTS "vendor/bin/phpstan" OR EXISTS "phpstan.neon" OR EXISTS "phpstan.neon.dist":
        detected_stack.typecheck_cmd = "./vendor/bin/phpstan analyse --no-progress 2>&1"
      # Sail-aware test command
      IF EXISTS "vendor/bin/sail":
        detected_stack.test_cmd = "./vendor/bin/sail test"
      ELSE:
        detected_stack.test_cmd = "php artisan test"

    BREAK

IF detected_stack != null:
  OUTPUT: "Stack erkannt: {detected_stack.stack_name}"
ELSE:
  OUTPUT: "Kein bekannter Stack erkannt. Lint/TypeCheck wird übersprungen."
```

---

## Phase 3: Wave-Based Implementation

```
FOR each wave IN waves:
  FOR each slice_id IN wave.slices:

    # ── Step 1: Task(slim-slice-implementer) → Code ──
    state.current_state = "implementing"
    Write(STATE_FILE, state)

    impl_result = Task(
      subagent_type: "slim-slice-implementer",
      prompt: "
        Implementiere {slice_id}.
        Slice-Spec: {spec_file}
        Architecture: {architecture_file}
        Integration-Map: {integration_map_file}
        Working-Directory: {state.worktree_path}

        REGELN:
        1. Lies die Slice-Spec vollständig (ACs + Deliverables + Constraints)
        2. Lies architecture.md für Types, Schema, Patterns
        3. Implementiere NUR die Deliverables aus der Spec
        4. Es gibt KEINE Code-Examples — du entscheidest die Implementation
        5. Du schreibst NUR Code, KEINE Tests
        6. Committe mit: git add -A && git commit -m 'feat({slice_id}): ...'
      "
    )

    impl_json = parse_agent_json(impl_result)
    IF impl_json.status == "failed":
      HARD STOP: "Implementer failed: {impl_json.notes}"

    # ── Step 2: Task(slim-code-reviewer) → Adversarial Review ──
    state.current_state = "code_review"
    review_retries = 0
    MAX_REVIEW_RETRIES = 3
    Write(STATE_FILE, state)

    WHILE review_retries < MAX_REVIEW_RETRIES:
      review_result = Task(
        subagent_type: "slim-code-reviewer",
        prompt: "
          Review Code für {slice_id}.
          Slice-Spec: {spec_file}
          Architecture: {architecture_file}
          Geänderte Dateien: {impl_json.files_changed}
          Commit: HEAD~1

          WICHTIG: Die Spec enthält KEINE Code-Examples.
          Prüfe gegen ACs + Architecture + Integration Contracts.
        "
      )

      review_json = parse_agent_json(review_result)

      IF review_json.verdict == "APPROVED":
        log_gate(slice_id, "code_review", {"verdict": "APPROVED", "blocking": 0, "attempt": review_retries + 1})
        OUTPUT: "Code Review: APPROVED"
        BREAK

      IF review_json.verdict == "REJECTED":
        log_gate(slice_id, "code_review", {"verdict": "REJECTED", "findings_count": len(review_json.findings), "findings": [f.message for f in review_json.findings], "attempt": review_retries + 1})
        review_retries++
        OUTPUT: "Code Review REJECTED (Versuch {review_retries}/{MAX_REVIEW_RETRIES}) → Auto-Fix..."

        IF review_retries >= MAX_REVIEW_RETRIES:
          HARD STOP: "Code Review nach 3 Versuchen REJECTED für {slice_id}"

        fix_impl_result = Task(
          subagent_type: "slim-slice-implementer",
          prompt: "
            Fixe Code-Review-Findings für {slice_id}.
            Review-Findings: {review_json.findings}
            Slice-Spec: {spec_file}
            Architecture: {architecture_file}
            Working-Directory: {state.worktree_path}
            Fixe ALLE Findings.
            Committe mit: git add -A && git commit -m 'fix({slice_id}): address code review findings'
          "
        )
        impl_json = parse_agent_json(fix_impl_result)

    # ── Step 3: Deterministic Gate (Lint/TypeCheck) ──
    IF detected_stack != null:
      state.current_state = "deterministic_gate"
      lint_retries = 0
      MAX_LINT_RETRIES = 3
      Write(STATE_FILE, state)

      WHILE lint_retries < MAX_LINT_RETRIES:
        gate_passed = true

        IF detected_stack.lint_autofix_cmd != null AND lint_retries == 0:
          Bash(detected_stack.lint_autofix_cmd)

        IF detected_stack.lint_check_cmd != null:
          lint_result = Bash(detected_stack.lint_check_cmd)
          IF lint_result.exit_code != 0:
            gate_passed = false
            OUTPUT: "Lint Check FAILED (Versuch {lint_retries + 1}/{MAX_LINT_RETRIES})"

        IF detected_stack.typecheck_cmd != null:
          tc_result = Bash(detected_stack.typecheck_cmd)
          IF tc_result.exit_code != 0:
            gate_passed = false
            OUTPUT: "TypeCheck FAILED (Versuch {lint_retries + 1}/{MAX_LINT_RETRIES})"

        IF gate_passed:
          log_gate(slice_id, "lint", {"result": "PASSED", "attempt": lint_retries + 1})
          OUTPUT: "Deterministic Gate PASSED"
          Bash("git diff --quiet || git add -A && git commit -m 'style({slice_id}): lint auto-fix'")
          BREAK

        lint_retries++
        IF lint_retries >= MAX_LINT_RETRIES:
          log_gate(slice_id, "lint", {"result": "FAILED", "attempt": lint_retries})
          HARD STOP: "Deterministic Gate nach 3 Versuchen fehlgeschlagen für {slice_id}"

        fix_result = Task(
          subagent_type: "debugger",
          prompt: "
            Lint/TypeCheck für {slice_id} fehlgeschlagen.
            Lint Output: {lint_result.output if lint_result else 'N/A'}
            TypeCheck Output: {tc_result.output if tc_result else 'N/A'}
            Geänderte Dateien: {impl_json.files_changed}
            Fixe die Lint/TypeCheck-Fehler.
          "
        )

    # ── Step 4: Task(test-writer) → Tests ──
    state.current_state = "writing_tests"
    Write(STATE_FILE, state)

    test_writer_result = Task(
      subagent_type: "test-writer",
      prompt: "
        Schreibe Tests für {slice_id}.
        Slice-Spec (ACs): {spec_file}
        Geänderte Dateien: {impl_json.files_changed}
        Working-Directory: {state.worktree_path}

        WICHTIG: Die Spec enthält Test-Skeletons mit it.todo() — nutze diese
        als Ausgangspunkt und implementiere die Assertions.
        Schreibe Tests gegen die Spec-ACs, nicht gegen den Code.
      "
    )

    tw_json = parse_agent_json(test_writer_result)
    IF tw_json.status == "failed":
      HARD STOP: "Test-Writer failed: Spec-Problem"
    IF tw_json.ac_coverage.total != tw_json.ac_coverage.covered:
      HARD STOP: "AC-Coverage nicht 100%. Fehlend: {tw_json.ac_coverage.missing}"

    # ── Step 5: Task(test-validator) → Validate ──
    state.current_state = "validating"
    state.retry_count = 0
    Write(STATE_FILE, state)

    validator_result = Task(
      subagent_type: "test-validator",
      prompt: "
        Validiere {slice_id}.
        Mode: slice_validation
        Test-Paths: {tw_json.test_files}
        Previous-Slice-Tests: {get_previous_test_paths(completed_slices)}
        Working-Directory: {working_dir}
      "
    )

    val_json = parse_agent_json(validator_result)

    # ── Step 6: Retry Loop (max 9x) ──
    MAX_RETRIES = 9
    WHILE val_json.overall_status == "failed" AND state.retry_count < MAX_RETRIES:
      state.retry_count += 1
      state.current_state = "auto_fixing"
      state.failed_stage = val_json.failed_stage
      Write(STATE_FILE, state)

      fix_result = Task(
        subagent_type: "debugger",
        prompt: "
          Tests für {slice_id} sind fehlgeschlagen.
          Failed Stage: {val_json.failed_stage}
          Error Output: {val_json.error_output}
          Slice-Spec: {spec_file}
          Geänderte Dateien: {impl_json.files_changed}
          Fixe den Code (NICHT die Tests aufweichen!).
        "
      )

      fix_json = parse_agent_json(fix_result)
      IF fix_json.status == "unable_to_fix":
        HARD STOP: "Debugger unable to fix: {fix_json.root_cause}"

      state.current_state = "validating"
      Write(STATE_FILE, state)

      validator_result = Task(
        subagent_type: "test-validator",
        prompt: "
          Re-Validiere {slice_id} nach Fix.
          Mode: slice_validation
          Test-Paths: {tw_json.test_files}
          Previous-Slice-Tests: {get_previous_test_paths(completed_slices)}
          Working-Directory: {working_dir}
        "
      )
      val_json = parse_agent_json(validator_result)

    IF val_json.overall_status == "failed":
      log_gate(slice_id, "tests", {"result": "FAILED", "retries": state.retry_count})
      HARD STOP: "9 Retries erschöpft für {slice_id}"

    log_gate(slice_id, "tests", {"result": "PASSED", "retries": state.retry_count})

    # ── Evidence speichern ──
    state.current_state = "slice_complete"
    evidence = {
      "feature": feature_name,
      "slice": slice_id,
      "timestamp": ISO_TIMESTAMP,
      "status": "completed",
      "implementation": impl_json,
      "review": review_json,
      "deterministic_gate": {
        "detected_stack": detected_stack.stack_name if detected_stack else null,
        "lint_passed": gate_passed,
        "lint_iterations": lint_retries
      },
      "tests": tw_json,
      "validation": val_json,
      "retries": state.retry_count,
      "review_iterations": review_retries
    }
    Write("{EVIDENCE_DIR}/{slice_id}.json", evidence)
```

---

## Phase 4: Final Validation

```
state.current_state = "final_validation"
Write(STATE_FILE, state)

# Lean Mode: Direkte Bash-Calls, KEIN Sub-Agent, KEIN Stack-Re-Detection.
# Nutzt detected_stack aus Phase 2b.

# 1. Lint Auto-Fix
IF detected_stack.lint_autofix_cmd != null:
  Bash(detected_stack.lint_autofix_cmd)

# 2. Lint Check
lint_retry = 0
IF detected_stack.lint_check_cmd != null:
  lint = Bash(detected_stack.lint_check_cmd)
  WHILE lint.exit_code != 0 AND lint_retry < 3:
    lint_retry += 1
    fix_result = Task(subagent_type: "debugger", prompt: "Lint fehlgeschlagen. Output: {lint.output}. Fixe die Fehler.")
    lint = Bash(detected_stack.lint_check_cmd)
  IF lint.exit_code != 0: HARD STOP: "Lint nach 3 Retries fehlgeschlagen"

# 3. TypeCheck
tc_retry = 0
IF detected_stack.typecheck_cmd != null:
  tc = Bash(detected_stack.typecheck_cmd)
  WHILE tc.exit_code != 0 AND tc_retry < 3:
    tc_retry += 1
    fix_result = Task(subagent_type: "debugger", prompt: "TypeCheck fehlgeschlagen. Output: {tc.output}. Fixe die Fehler.")
    tc = Bash(detected_stack.typecheck_cmd)
  IF tc.exit_code != 0: HARD STOP: "TypeCheck nach 3 Retries fehlgeschlagen"

# 4. Full Test Suite
test_retry = 0
test = Bash("{detected_stack.test_cmd} 2>&1")
WHILE test.exit_code != 0 AND test_retry < 9:
  test_retry += 1
  fix_result = Task(subagent_type: "debugger", prompt: "Tests fehlgeschlagen. Output: {test.output}. Fixe den Code (NICHT die Tests aufweichen!).")
  test = Bash("{detected_stack.test_cmd} 2>&1")
IF test.exit_code != 0: HARD STOP: "Tests nach 9 Retries fehlgeschlagen"

# 5. Commit lint-fixes falls vorhanden
Bash("git diff --quiet || git add -A && git commit -m 'style: lint auto-fix'")
```

---

## Phase 4b: Conflict Scan (non-blocking)

```
# Step 1: Scanner-Agent aufrufen (Post-Scan)
state.current_state = "conflict_scan"
Write(STATE_FILE, state)

scanner_result = Task("conflict-scanner", {
  mode: "actual",
  branch: state.branch,
  spec_path: state.spec_path,
  repo: repo,
  issue_number: state.issue_number
})
scanner_json = parse_agent_json(scanner_result)

# Step 2: Bedingt Reporter-Agent aufrufen
IF scanner_json.status == "completed" AND scanner_json.has_overlap == true:
  state.current_state = "conflict_report"
  Write(STATE_FILE, state)
  reporter_result = Task("conflict-reporter", {
    overlap_report_path: "{state.spec_path}/overlap-report.json",
    own_issue_number: state.issue_number,
    repo: repo
  })
  reporter_json = parse_agent_json(reporter_result)
  IF reporter_json.status == "failed":
    OUTPUT: "Warning: Conflict reporter failed: {reporter_json.notes}"
ELIF scanner_json.status == "completed" AND scanner_json.has_overlap == false:
  OUTPUT: "Post-Scan: Keine Overlaps gefunden."
ELIF scanner_json.status == "failed":
  OUTPUT: "Warning: Conflict scan failed: {scanner_json.notes}"
  # Non-blocking — Pipeline geht weiter

# Step 3: Label wechseln (immer — best-effort)
IF state.issue_number is not null:
  Bash("gh issue edit {state.issue_number} --repo {repo} --remove-label pipeline:running --add-label pipeline:merge-ready")
```

---

## Phase 5: Completion

```
state.current_state = "feature_complete"
# Feature Evidence, Branch Info, Nächste Schritte

# Worktree Cleanup (nach erfolgreicher Pipeline)
# git worktree remove worktrees/{feature_name}
# git worktree prune
```

---

## Referenzen

- Slim Implementer: `${CLAUDE_PLUGIN_ROOT}/agents/slim-slice-implementer.md`
- Slim Code Reviewer: `${CLAUDE_PLUGIN_ROOT}/agents/slim-code-reviewer.md`
- Test Writer: `${CLAUDE_PLUGIN_ROOT}/agents/test-writer.md` (unverändert)
- Test Validator: `${CLAUDE_PLUGIN_ROOT}/agents/test-validator.md` (unverändert)
- Debugger: `${CLAUDE_PLUGIN_ROOT}/agents/debugger.md` (unverändert)
