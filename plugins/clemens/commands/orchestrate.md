---
description: "Feature-Orchestrator mit Sub-Agent Pipeline. Implementiert Features wave-by-wave mit 6-Step Pipeline (Stack-Detection -> Implementer -> Code-Reviewer -> Deterministic Gate -> Test-Writer -> Test-Validator/Debugger), JSON-Parsing, 9 Retries und stack-agnostischer Final Validation."
---

# Orchestrate Feature Implementation

Du orchestrierst die Implementierung eines Features slice-by-slice mit Sub-Agent Pipeline.

**KRITISCHE REGELN (KEINE Ausnahmen):**
1. **Autonomer Betrieb:** Frage NIEMALS zwischen Waves oder Slices nach Bestaetigung.
2. **Exit Code ist Wahrheit:** exit_code != 0 = FEHLGESCHLAGEN. Immer.
3. **Kein direktes Bash:** Du fuehrst KEINE Tests direkt aus. ALLES via Sub-Agents. Ausnahme: Deterministic Gate (Lint/TypeCheck) laeuft direkt via Bash.
4. **JSON-Parsing:** Jeder Sub-Agent-Output wird als JSON geparsed (letzter ```json``` Block). Bei Parse-Failure: HARD STOP.
5. **9 Retries:** Max 9 Debugger-Retries pro Slice, max 3 Code-Review-Retries, max 3 Lint/TypeCheck-Retries. Danach HARD STOP.

**Input:** $ARGUMENTS (Spec-Pfad)

---

## Phase 1: Input-Validierung & Pre-Impl Sanity Check

```
1. Pruefe ob $ARGUMENTS einen Spec-Pfad enthaelt
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
# Erkennt automatisch welche Package-Manager im Projekt existieren

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

    # Step 1: Install dependencies (catches version conflicts)
    result = Bash("{install_cmd}", cwd=dir)
    IF result.exit_code != 0:
      HARD STOP: "Dependency install failed in {dir}. Fix before implementation."

    # Step 2: Smoke-test imports (catches runtime incompatibilities)
    # Extrahiere kritische Dependencies aus Architecture Integrations-Tabelle
    # und pruefe ob sie importierbar sind
    IF file == "package.json":
      Bash("npx tsc --noEmit 2>&1 | head -20", cwd=dir)
    ELIF file in ["requirements.txt", "pyproject.toml"]:
      # Importiere jede Dependency einmal
      deps = parse_dependencies(location)
      FOR each dep IN deps:
        Bash("python -c 'import {dep}'", cwd=dir)

IF ANY check failed:
  HARD STOP: "Dependency Pre-Flight fehlgeschlagen. Behebe Konflikte vor Implementierung."
```

---

## Phase 2: Setup & State Management

```
STATE_FILE = "{spec_path}/.orchestrator-state.json"
EVIDENCE_DIR = ".claude/evidence/{feature_name}/"

# State Management mit erweiterten Feldern
state = {
  "spec_path": spec_path,
  "feature_name": feature_name,
  "status": "in_progress",
  # Gueltige current_state-Werte: "pre_check" | "implementing" | "code_review" |
  #   "deterministic_gate" | "writing_tests" | "validating" | "auto_fixing" |
  #   "slice_complete" | "final_validation" | "conflict_scan" | "conflict_report" |
  #   "feature_complete"
  "current_state": "pre_check",
  "current_slice_id": null,
  "retry_count": 0,
  "failed_stage": null,
  "waves": [...],
  "completed_slices": [],
  "evidence_files": []
}

# Resume Support wie bisher
IF EXISTS STATE_FILE:
  # Resume-Logik

# Worktree-Erstellung (idempotent)
worktree_check = Bash("git worktree list")
IF NOT "worktrees/{feature_name}" IN worktree_check.output:
  Bash("git worktree add worktrees/{feature_name} -b feature/{feature_name}")
state.worktree_path = "worktrees/{feature_name}"
state.branch = "feature/{feature_name}"
Write(STATE_FILE, state)
```

---

## Helper: JSON-Parsing

```
FUNCTION parse_agent_json(agent_output):
  # Finde den LETZTEN ```json``` Block
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

## Phase 2b: Stack Detection

```
# Erkenne Tech-Stack anhand von Indicator-Dateien im Projekt
# Wird einmal pro Feature ausgefuehrt, nicht pro Slice

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

    # Stack-spezifische Commands ableiten
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

    BREAK  # Erste Erkennung reicht

IF detected_stack != null:
  OUTPUT: "Stack erkannt: {detected_stack.stack_name}"
ELSE:
  OUTPUT: "Kein bekannter Stack erkannt. Lint/TypeCheck wird uebersprungen."
```

---

## Phase 3: Wave-Based Implementation

```
FOR each wave IN waves:
  FOR each slice_id IN wave.slices:

    # ── Step 1: Task(slice-implementer) → Code ──
    state.current_state = "implementing"
    Write(STATE_FILE, state)

    impl_result = Task(
      subagent_type: "slice-implementer",
      prompt: "
        Implementiere {slice_id}.
        Slice-Spec: {spec_file}
        Architecture: {architecture_file}
        Integration-Map: {integration_map_file}

        REGELN:
        1. Lies die Slice-Spec vollstaendig
        2. Implementiere NUR was dort steht
        3. Du schreibst NUR Code, KEINE Tests. Der Test-Writer Agent uebernimmt Tests.
        4. Committe mit: git add -A && git commit -m 'feat({slice_id}): ...'
      "
    )

    impl_json = parse_agent_json(impl_result)
    IF impl_json.status == "failed":
      HARD STOP: "Implementer failed: {impl_json.notes}"

    # ── Step 2: Task(code-reviewer) → Adversarial Review ──
    state.current_state = "code_review"
    review_retries = 0
    MAX_REVIEW_RETRIES = 3
    Write(STATE_FILE, state)

    WHILE review_retries < MAX_REVIEW_RETRIES:
      review_result = Task(
        subagent_type: "code-reviewer",
        prompt: "
          Review Code fuer {slice_id}.
          Slice-Spec: {spec_file}
          Architecture: {architecture_file}
          Geaenderte Dateien: {impl_json.files_changed}
          Commit: HEAD~1
        "
      )

      review_json = parse_agent_json(review_result)

      IF review_json.verdict == "APPROVED" OR review_json.verdict == "CONDITIONAL":
        OUTPUT: "Code Review: {review_json.verdict} (Iteration {review_retries + 1})"
        BREAK

      IF review_json.verdict == "REJECTED":
        review_retries++
        OUTPUT: "Code Review REJECTED (Versuch {review_retries}/{MAX_REVIEW_RETRIES}) → Auto-Fix..."

        IF review_retries >= MAX_REVIEW_RETRIES:
          HARD STOP: "Code Review nach 3 Versuchen REJECTED fuer {slice_id}"

        # Fix via Implementer
        fix_impl_result = Task(
          subagent_type: "slice-implementer",
          prompt: "
            Fixe Code-Review-Findings fuer {slice_id}.
            Review-Findings: {review_json.findings}
            Slice-Spec: {spec_file}
            Fixe NUR die CRITICAL und HIGH Findings.
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

        # Step 3a: Lint Auto-Fix (einmal)
        IF detected_stack.lint_autofix_cmd != null AND lint_retries == 0:
          Bash(detected_stack.lint_autofix_cmd)
          # Auto-fix darf nicht fehlschlagen, Ergebnis wird im Check geprueft

        # Step 3b: Lint Check
        IF detected_stack.lint_check_cmd != null:
          lint_result = Bash(detected_stack.lint_check_cmd)
          IF lint_result.exit_code != 0:
            gate_passed = false
            OUTPUT: "Lint Check FAILED (Versuch {lint_retries + 1}/{MAX_LINT_RETRIES})"

        # Step 3c: TypeCheck
        IF detected_stack.typecheck_cmd != null:
          tc_result = Bash(detected_stack.typecheck_cmd)
          IF tc_result.exit_code != 0:
            gate_passed = false
            OUTPUT: "TypeCheck FAILED (Versuch {lint_retries + 1}/{MAX_LINT_RETRIES})"

        IF gate_passed:
          OUTPUT: "Deterministic Gate PASSED"
          # Committe Auto-Fix Aenderungen falls vorhanden
          Bash("git diff --quiet || git add -A && git commit -m 'style({slice_id}): lint auto-fix'")
          BREAK

        lint_retries++
        IF lint_retries >= MAX_LINT_RETRIES:
          HARD STOP: "Deterministic Gate (Lint/TypeCheck) nach 3 Versuchen fehlgeschlagen fuer {slice_id}"

        # Fix via Debugger
        fix_result = Task(
          subagent_type: "debugger",
          prompt: "
            Lint/TypeCheck fuer {slice_id} fehlgeschlagen.
            Lint Output: {lint_result.output if lint_result else 'N/A'}
            TypeCheck Output: {tc_result.output if tc_result else 'N/A'}
            Geaenderte Dateien: {impl_json.files_changed}
            Fixe die Lint/TypeCheck-Fehler.
          "
        )

    # ── Step 4: Task(test-writer) → Tests ──
    state.current_state = "writing_tests"
    Write(STATE_FILE, state)

    test_writer_result = Task(
      subagent_type: "test-writer",
      prompt: "
        Schreibe Tests fuer {slice_id}.
        Slice-Spec (ACs): {spec_file}
        Geaenderte Dateien: {impl_json.files_changed}
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
          Tests fuer {slice_id} sind fehlgeschlagen.
          Failed Stage: {val_json.failed_stage}
          Error Output: {val_json.error_output}
          Slice-Spec: {spec_file}
          Geaenderte Dateien: {impl_json.files_changed}
          Fixe den Code (NICHT die Tests aufweichen!).
        "
      )

      fix_json = parse_agent_json(fix_result)
      IF fix_json.status == "unable_to_fix":
        HARD STOP: "Debugger unable to fix: {fix_json.root_cause}"

      # Re-validate
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
      HARD STOP: "9 Retries erschoepft fuer {slice_id}"

    # ── Evidence speichern ──
    state.current_state = "slice_complete"
    evidence = {
      "feature": feature_name,
      "slice": slice_id,
      "timestamp": ISO_TIMESTAMP,
      "status": "completed",
      "implementation": impl_json,  # { status, files_changed, commit_hash, notes }
      "review": review_json,        # { verdict, findings, summary }
      "deterministic_gate": {
        "detected_stack": detected_stack.stack_name if detected_stack else null,
        "lint_passed": gate_passed,
        "lint_iterations": lint_retries
      },
      "tests": tw_json,              # { status, test_files, test_count, ac_coverage: { total, covered, missing } }
      "validation": val_json,        # { overall_status, stages: { tests, lint, typecheck }, failed_stage?, error_output? }
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

final_result = Task(
  subagent_type: "test-validator",
  prompt: "
    Final Validation fuer Feature {feature_name}.
    Mode: final_validation
    Previous-Slice-Tests: {get_all_test_paths(completed_slices)}
    Working-Directory: {working_dir}
  "
)

final_json = parse_agent_json(final_result)

# Retry bei Failure (max 9x)
final_retry = 0
WHILE final_json.overall_status == "failed" AND final_retry < MAX_RETRIES:
  final_retry += 1
  fix_result = Task(subagent_type: "debugger", ...)
  fix_json = parse_agent_json(fix_result)
  IF fix_json.status == "unable_to_fix": HARD STOP
  final_result = Task(subagent_type: "test-validator", mode: final_validation, ...)
  final_json = parse_agent_json(final_result)

IF final_json.overall_status == "failed":
  HARD STOP: "Final Validation fehlgeschlagen nach 9 Retries"
```

---

## Phase 4b: Conflict Scan (non-blocking)

```
state.current_state = "conflict_scan"
Write(STATE_FILE, state)

# Step 1: Script aufrufen
plugin_path = "plugins/clemens"
scan_result = Bash("node {plugin_path}/scripts/conflict-scanner.js --branch {state.branch} --spec-path {state.spec_path} --repo {repo}")
scan_exit_code = scan_result.exit_code

# Step 2: Bedingt Sub-Agent aufrufen
own_issue_number = null

IF scan_exit_code == 1:
  own_issue_number = parse_issue_number_from_stdout(scan_result.stdout)
  reporter_result = Task("conflict-reporter", {
    overlap_report_path: "{state.spec_path}/overlap-report.json",
    own_issue_number: own_issue_number,
    repo: repo
  })
  reporter_json = parse_agent_json(reporter_result)
  IF reporter_json.status == "failed":
    OUTPUT: "Warning: Conflict reporter failed: {reporter_json.notes}"
  state.current_state = "conflict_report"
  Write(STATE_FILE, state)
ELIF scan_exit_code == 0:
  own_issue_number = parse_issue_number_from_stdout(scan_result.stdout)
  state.current_state = "conflict_scan"
  Write(STATE_FILE, state)
ELIF scan_exit_code == 2:
  OUTPUT: "Warning: Conflict scan failed: {scan_result.stderr}"
  # State bleibt unveraendert (non-blocking)

# Step 3: Label wechseln (immer — best-effort)
IF own_issue_number is not null:
  Bash("gh issue edit {own_issue_number} --repo {repo} --remove-label pipeline:running --add-label pipeline:merge-ready")
```

---

## Phase 5: Completion

```
state.current_state = "feature_complete"
# Feature Evidence, Branch Info, Naechste Schritte

# Worktree Cleanup (nach erfolgreicher Pipeline)
# git worktree remove worktrees/{feature_name}
# git worktree prune
```
