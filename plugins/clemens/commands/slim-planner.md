---
description: "Slim Planner: Task-Driven Slice-Planning. Slicer zerlegt Discovery-Slices → schlanke Specs (ACs + Tests, kein Code) → Hybrid Gate 2 (deterministic + LLM). Anti-Bias Fixes eingebaut."
---

# Slim Planner Command

Du führst das **Slim Slice-Planning** aus — task-driven, mit atomaren Slices und Hybrid-Compliance.

**Input:** $ARGUMENTS (Spec-Pfad, z.B. `specs/2026-03-02-e2e-generate-persist`)

**Unterschied zum Standard-Planner:**
- **Slicer-Phase:** Discovery-Slices werden in atomare Tasks zerlegt (1-3 Dateien pro Slice)
- **Schlanke Specs:** ~150-300 Zeilen statt ~1.500+ (keine Code-Examples, nur ACs + Test-Skeletons)
- **Hybrid Gate 2:** Deterministic Checks zuerst, LLM nur für Inhaltsqualität
- **Anti-Bias:** Alter Compliance-Report wird vor Re-Check gelöscht

---

## Phase 1: Input-Validierung

```
1. Prüfe ob $ARGUMENTS einen Spec-Pfad enthält
2. Falls kein Argument: Suche neuestes specs/*/discovery.md und frage via AskUserQuestion
3. Validiere dass folgende Dateien existieren:

REQUIRED (Block wenn fehlt):
├── {spec_path}/discovery.md         → Feature-Anforderungen
├── {spec_path}/architecture.md      → Technische Architektur

OPTIONAL (Warning wenn fehlt):
├── {spec_path}/wireframes.md        → UI-Spezifikationen
├── {spec_path}/compliance-architecture.md  → Gate 1 Report

IF discovery.md MISSING:
  OUTPUT: "❌ STOP: discovery.md fehlt. Zuerst /discovery ausführen."
  HARD STOP

IF architecture.md MISSING:
  OUTPUT: "❌ STOP: architecture.md fehlt. Zuerst /architecture ausführen."
  HARD STOP

spec_path = [ermittelter Spec-Ordner]
```

---

## Phase 2: Setup & State Management

```
STATE_FILE = "{spec_path}/.slim-planner-state.json"

# ─────────────────────────────────────────────────────────
# Step 1: Check for existing state (Resume Support)
# ─────────────────────────────────────────────────────────

IF EXISTS STATE_FILE:
  state = Read(STATE_FILE)

  IF state.status == "completed":
    OUTPUT: "✅ Planning bereits abgeschlossen. Für Neustart: Lösche {STATE_FILE}"
    STOP

  IF state.status == "in_progress":
    # ─── State-Recovery aus Filesystem (Single Source of Truth) ───
    # Der State-File kann veraltet sein (z.B. nach Crash).
    # Das Filesystem (vorhandene Slices + Compliance-Reports) ist die Wahrheit.

    actual_approved = []
    FOR each compliance_file IN Glob("{spec_path}/slices/compliance-slice-*.md"):
      content = Read(compliance_file)
      slice_num = extract_number(compliance_file)  # compliance-slice-03.md → 3
      IF content CONTAINS "VERDICT: APPROVED":
        actual_approved.append(slice_num)

    # State-File mit Filesystem-Wahrheit abgleichen
    IF actual_approved != state.approved_slices:
      OUTPUT: "🔧 State-Recovery: State-File sagte {len(state.approved_slices)} approved, Filesystem hat {len(actual_approved)} approved. Korrigiere..."
      state.approved_slices = sorted(actual_approved)
      FOR each num IN actual_approved:
        state.slices[num - 1].status = "approved"

    # Naechsten unerledigten Slice finden
    next_index = 0
    FOR i, slice IN enumerate(state.slices):
      IF slice.number NOT IN actual_approved:
        next_index = i
        BREAK
      IF i == len(state.slices) - 1:
        next_index = len(state.slices)  # Alle fertig → Gate 3

    state.current_slice_index = next_index
    state.last_updated = ISO_TIMESTAMP
    Write(STATE_FILE, JSON.stringify(state, indent=2))

    OUTPUT: "
    ═══════════════════════════════════════════════════════════
    🔄 RESUME: Fortsetzen ab Slice {next_index + 1}/{state.total_slices}
    ═══════════════════════════════════════════════════════════
    Approved (aus Filesystem): {actual_approved}
    Naechster Slice: {next_index + 1 if next_index < len(state.slices) else 'Gate 3'}
    "

    slices = state.slices
    approved_slices = actual_approved
    current_index = next_index

    IF current_index >= len(state.slices):
      SKIP to Phase 5  # Alle Slices fertig, Gate 3
    ELSE:
      SKIP to Phase 4 at current_index

# ─────────────────────────────────────────────────────────
# Step 2: Stack Detection (einmal, für alle Slices)
# ─────────────────────────────────────────────────────────

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
    detected_stack = stack_name
    BREAK

IF detected_stack != null:
  OUTPUT: "🔧 Stack erkannt: {detected_stack}"
ELSE:
  OUTPUT: "⚠️ Kein bekannter Stack erkannt."
```

---

## Phase 3: Slicer — Discovery-Slices zerlegen

```
OUTPUT: "
═══════════════════════════════════════════════════════════
🔪 PHASE 3: Slice Decomposition
═══════════════════════════════════════════════════════════
"

# ─────────────────────────────────────────────────────────
# Step 1: Slicer aufrufen mit FRISCHEM CONTEXT
# ─────────────────────────────────────────────────────────

slicer_result = Task(
  subagent_type: "slim-slicer",
  description: "Decompose Discovery Slices",
  prompt: "
    Zerlege die Discovery-Slices in atomare Implementation-Tasks.

    ## Input
    - {spec_path}/discovery.md → Section 'Implementation Slices' oder 'Slices'
    - {spec_path}/architecture.md → Technische Architektur
    - {spec_path}/wireframes.md → UI-Spezifikationen (falls vorhanden)

    ## Stack
    Erkannter Stack: {detected_stack}

    ## Output
    Schreibe: {spec_path}/slim-slices.md

    ## Regeln
    - Maximal 3 produktive Dateien pro Slice
    - Ein Concern pro Slice
    - Jeder Slice hat messbares Done-Signal
    - Dependencies als DAG
  "
)

# ─────────────────────────────────────────────────────────
# Step 2: Decomposition validieren
# ─────────────────────────────────────────────────────────

IF NOT EXISTS {spec_path}/slim-slices.md:
  OUTPUT: "❌ CHECKPOINT FAILED: slim-slices.md wurde nicht erstellt"
  HARD STOP

slim_slices = Read({spec_path}/slim-slices.md)
# Extrahiere Slice-Liste aus slim-slices.md
# Jeder Slice hat: number, name, scope, deliverables, done_signal, dependencies

OUTPUT: "{total_slices} atomare Slices extrahiert."

# ─────────────────────────────────────────────────────────
# Step 3: Initialize State
# ─────────────────────────────────────────────────────────

state = {
  "spec_path": spec_path,
  "status": "in_progress",
  "phase": "slice_planning",
  "started_at": ISO_TIMESTAMP,
  "detected_stack": detected_stack,
  "total_slices": len(slices),
  "current_slice_index": 0,
  "slices": [
    { "number": N, "name": "...", "status": "pending", "retries": 0 }
    for each slice
  ],
  "approved_slices": [],
  "failed_slices": [],
  "gate3_retries": 0,
  "last_action": "Slicer completed, {total_slices} slices",
  "last_updated": ISO_TIMESTAMP
}

Write(STATE_FILE, JSON.stringify(state, indent=2))
OUTPUT: "📊 State initialisiert: {STATE_FILE}"

mkdir -p {spec_path}/slices
```

---

## Phase 4: Slim Slice Planning Loop (KRITISCH!)

**WICHTIG: DU führst die Task Calls aus, NICHT ein anderer Agent!**

```
MAX_RETRIES = 9

FOR each slice IN slices:
  retry_count = 0
  slice_path = "{spec_path}/slices/slice-{NN}-{slug}.md"

  OUTPUT: "
  ═══════════════════════════════════════════════════════════
  📋 SLICE {slice.number}/{total}: {slice.name}
  ═══════════════════════════════════════════════════════════
  "

  WHILE retry_count < MAX_RETRIES:

    # ─────────────────────────────────────────────────────────
    # Step 1: Slice erstellen mit FRISCHEM CONTEXT
    # ─────────────────────────────────────────────────────────

    IF retry_count == 0:
      # Erste Erstellung
      slice_result = Task(
        subagent_type: "slim-slice-writer",
        description: "Write Slim Slice {slice.number}",
        prompt: "
          Erstelle Slim Slice {slice.number}: {slice.name}

          ## Input-Dateien (MUSS gelesen werden)
          - {spec_path}/architecture.md (Referenz, NICHT kopieren)
          - {spec_path}/wireframes.md (Referenz, falls vorhanden)
          - {spec_path}/discovery.md (für Kontext)
          - Vorherige genehmigte Slices: {approved_slices_paths}

          ## Slice-Anforderungen (aus slim-slices.md)
          Scope: {slice.scope}
          Deliverables: {slice.deliverables}
          Done-Signal: {slice.done_signal}
          Dependencies: {slice.dependencies}
          Stack: {detected_stack}

          ## Output
          Schreibe: {spec_path}/slices/slice-{NN}-{slug}.md

          ## KRITISCH - Slim Template
          Lies ${CLAUDE_PLUGIN_ROOT}/templates/slim-plan-spec.md und stelle sicher:
          - ~150-300 Zeilen (NICHT mehr!)
          - KEINE Code-Examples
          - KEINE Wireframe-Kopien
          - KEINE Architecture-Echo
          - ACs mit konkreten Werten (GIVEN/WHEN/THEN)
          - Test-Skeletons mit it.todo() (KEINE Assertions)
        "
      )
    ELSE:
      # Fix-Versuch mit Compliance-Feedback
      slice_result = Task(
        subagent_type: "slim-slice-writer",
        description: "Fix Slim Slice {slice.number}",
        prompt: "
          FIX Slim Slice {slice.number}: {slice.name}

          ## Compliance-Fehler (MUSS gefixt werden)
          Lies: {spec_path}/slices/compliance-slice-{NN}.md

          ## Blocking Issues
          {blocking_issues_summary}

          ## Anweisungen
          1. Lies den Compliance-Report vollständig
          2. Fixe ALLE Blocking Issues
          3. Halte den Slice SCHLANK (< 400 Zeilen)
          4. Aktualisiere: {spec_path}/slices/slice-{NN}-{slug}.md
        "
      )

    # ─────────────────────────────────────────────────────────
    # Step 2: VALIDATION CHECKPOINT
    # ─────────────────────────────────────────────────────────

    # Prüfe ob Slice-Datei existiert
    IF NOT EXISTS {spec_path}/slices/slice-{NN}-*.md:
      OUTPUT: "❌ CHECKPOINT FAILED: Slice-Datei wurde nicht erstellt"
      retry_count++
      CONTINUE

    # ─────────────────────────────────────────────────────────
    # Step 2b: FIX-VERIFIKATION (nur bei Retries)
    # ─────────────────────────────────────────────────────────

    IF retry_count > 0:
      slice_content = Read({spec_path}/slices/slice-{NN}-{slug}.md)

      unfixed_issues = []
      FOR each issue IN blocking_issues_summary:
        IF issue STILL PRESENT in slice_content:
          unfixed_issues.append(issue)

      IF len(unfixed_issues) > 0:
        OUTPUT: "⚠️ Writer hat {len(unfixed_issues)}/{len(blocking_issues_summary)} Issues NICHT gefixt. Erneuter Writer-Fix..."
        CONTINUE

      OUTPUT: "✓ Fix-Verifikation bestanden."

    # ─────────────────────────────────────────────────────────
    # Step 2c: Alten Compliance-Report löschen (Anti-Bias)
    # ─────────────────────────────────────────────────────────

    compliance_report_path = "{spec_path}/slices/compliance-slice-{NN}.md"
    IF EXISTS compliance_report_path:
      DELETE compliance_report_path
      OUTPUT: "🗑️ Alter Compliance-Report gelöscht (Anti-Bias)"

    # ─────────────────────────────────────────────────────────
    # Step 3: Hybrid Gate 2 mit FRISCHEM CONTEXT
    # ─────────────────────────────────────────────────────────

    OUTPUT: "🔍 Gate 2: Hybrid Compliance Check für Slice {slice.number}..."

    compliance_result = Task(
      subagent_type: "slim-slice-compliance",
      description: "Gate 2 Slim Check Slice {slice.number}",
      prompt: "
        Prüfe Slim Slice Compliance (Hybrid: Deterministic + LLM).

        ## Zu prüfender Slice
        {spec_path}/slices/slice-{NN}-{slug}.md

        ## Referenz-Dokumente
        - {spec_path}/architecture.md
        - {spec_path}/wireframes.md
        - {spec_path}/discovery.md
        - Vorherige genehmigte Slices: {approved_slices_paths}

        ## Output
        Schreibe: {spec_path}/slices/compliance-slice-{NN}.md

        ## WICHTIG - Unabhängige Prüfung!
        - Lies KEINE vorherigen Compliance-Reports
        - Phase 2 (Deterministic) ZUERST — bei FAIL sofort stoppen
        - Phase 3 (LLM) NUR wenn Phase 2 PASS

        Am Ende MUSS stehen:
        VERDICT: APPROVED oder VERDICT: FAILED
      "
    )

    # ─────────────────────────────────────────────────────────
    # Step 4: Verdict prüfen
    # ─────────────────────────────────────────────────────────

    compliance_report = Read({spec_path}/slices/compliance-slice-{NN}.md)

    IF compliance_report CONTAINS "VERDICT: APPROVED":
      OUTPUT: "✅ Slice {slice.number} APPROVED"
      approved_slices.append(slice)

      state.slices[slice.index].status = "approved"
      state.approved_slices.append(slice.number)
      state.current_slice_index = slice.index + 1
      state.last_action = "Slice {slice.number} approved"
      state.last_updated = ISO_TIMESTAMP
      Write(STATE_FILE, JSON.stringify(state, indent=2))

      BREAK

    IF compliance_report CONTAINS "VERDICT: FAILED":
      retry_count++

      blocking_issues_summary = extract_blocking_issues(compliance_report)

      state.slices[slice.index].status = "retrying"
      state.slices[slice.index].retries = retry_count
      state.last_action = "Slice {slice.number} failed, retry {retry_count}/9"
      state.last_updated = ISO_TIMESTAMP
      Write(STATE_FILE, JSON.stringify(state, indent=2))

      IF retry_count >= MAX_RETRIES:
        state.status = "failed"
        state.slices[slice.index].status = "failed"
        state.failed_slices.append(slice.number)
        state.last_action = "HARD STOP: Slice {slice.number} nach 9 Versuchen"
        state.completed_at = ISO_TIMESTAMP
        Write(STATE_FILE, JSON.stringify(state, indent=2))

        OUTPUT: "
        ╔════════════════════════════════════════════════════════════╗
        ║  ❌ HARD STOP: Slice {slice.number} nach 9 Versuchen       ║
        ╠════════════════════════════════════════════════════════════╣
        ║  Blocking Issues: {blocking_issues_summary}                ║
        ║  Nächste Schritte:                                         ║
        ║  1. Manuell fixen: {slice_path}                            ║
        ║  2. /slim-planner {spec_path} erneut starten               ║
        ║  State: {STATE_FILE}                                       ║
        ╚════════════════════════════════════════════════════════════╝
        "
        HARD STOP

      OUTPUT: "⚠️ Slice {slice.number} FAILED (Versuch {retry_count}/9) → Auto-Fix..."
```

---

## Phase 5: Gate 3 - Integration Validation

```
OUTPUT: "
═══════════════════════════════════════════════════════════
🔗 PHASE 5: Integration Validation (Gate 3)
═══════════════════════════════════════════════════════════
"

state.phase = "gate_3_integration"
state.last_action = "Entering Gate 3"
state.last_updated = ISO_TIMESTAMP
Write(STATE_FILE, JSON.stringify(state, indent=2))

retry_count = 0
MAX_RETRIES = 9

WHILE retry_count < MAX_RETRIES:

  integration_result = Task(
    subagent_type: "integration-map",
    description: "Gate 3 Integration Map",
    prompt: "
      Erstelle Integration Map für: {spec_path}

      ## Input
      - Alle Slices: {spec_path}/slices/slice-*.md
      - Alle Compliance Reports: {spec_path}/slices/compliance-slice-*.md

      ## Output (alle 3 PFLICHT)
      1. {spec_path}/integration-map.md
      2. {spec_path}/e2e-checklist.md
      3. {spec_path}/orchestrator-config.md

      ## KRITISCH
      Am Ende MUSS stehen:
      VERDICT: READY FOR ORCHESTRATION oder VERDICT: GAPS FOUND

      Falls GAPS FOUND:
      - MISSING_INPUTS: [Liste]
      - ORPHANED_OUTPUTS: [Liste]
      - AFFECTED_SLICES: [welche Slices müssen gefixt werden]
    "
  )

  integration_map = Read({spec_path}/integration-map.md)

  IF integration_map CONTAINS "VERDICT: READY FOR ORCHESTRATION":
    state.status = "completed"
    state.phase = "completed"
    state.last_action = "Gate 3 APPROVED - Ready for Orchestration"
    state.completed_at = ISO_TIMESTAMP
    Write(STATE_FILE, JSON.stringify(state, indent=2))

    OUTPUT: "
    ╔════════════════════════════════════════════════════════════╗
    ║  ✅ GATE 3 APPROVED - Integration vollständig              ║
    ╠════════════════════════════════════════════════════════════╣
    ║                                                            ║
    ║  Erstellte Dateien:                                        ║
    ║  ✓ slim-slices.md (Decomposition)                          ║
    ║  ✓ integration-map.md                                      ║
    ║  ✓ e2e-checklist.md                                        ║
    ║  ✓ orchestrator-config.md                                  ║
    ║                                                            ║
    ║  State: {STATE_FILE} (status: completed)                   ║
    ║                                                            ║
    ║  Nächster Schritt:                                         ║
    ║  /orchestrate {spec_path}                                  ║
    ║                                                            ║
    ╚════════════════════════════════════════════════════════════╝
    "
    STOP

  IF integration_map CONTAINS "VERDICT: GAPS FOUND":
    retry_count++

    state.gate3_retries = retry_count
    state.last_action = "Gate 3 failed, retry {retry_count}/9"
    state.last_updated = ISO_TIMESTAMP
    Write(STATE_FILE, JSON.stringify(state, indent=2))

    IF retry_count >= MAX_RETRIES:
      state.status = "failed"
      state.last_action = "HARD STOP: Gate 3 nach 9 Versuchen"
      state.completed_at = ISO_TIMESTAMP
      Write(STATE_FILE, JSON.stringify(state, indent=2))

      OUTPUT: "
      ╔════════════════════════════════════════════════════════════╗
      ║  ❌ HARD STOP: Gate 3 nach 9 Versuchen fehlgeschlagen      ║
      ║  State: {STATE_FILE} (status: failed)                      ║
      ╚════════════════════════════════════════════════════════════╝
      "
      HARD STOP

    OUTPUT: "⚠️ Gate 3 GAPS FOUND (Versuch {retry_count}/9) → Fixe betroffene Slices..."

    FOR each affected_slice IN gaps.affected_slices:
      Task(
        subagent_type: "slim-slice-writer",
        description: "Fix Integration Gap in {affected_slice}",
        prompt: "
          FIX Integration Gap in Slice {affected_slice}

          Problem: {gap.description}
          Action: {gap.action}

          Lies: {spec_path}/integration-map.md für Details
          Aktualisiere: {spec_path}/slices/{affected_slice}.md
          Halte den Slice SCHLANK (< 400 Zeilen)
        "
      )
```

---

## Output

```
{spec_path}/
├── .slim-planner-state.json            # State Tracking ✓
├── discovery.md                        # Input (existiert)
├── architecture.md                     # Input (existiert)
├── wireframes.md                       # Input (optional)
├── slim-slices.md                      # Slicer Output ✓
├── integration-map.md                  # Gate 3 Output ✓
├── e2e-checklist.md                    # Gate 3 Output ✓
├── orchestrator-config.md              # Gate 3 Output ✓
└── slices/
    ├── slice-01-{name}.md              # Slim Spec (~200 Zeilen)
    ├── compliance-slice-01.md          # Hybrid Gate 2 ✓
    ├── slice-02-{name}.md
    ├── compliance-slice-02.md
    └── ...
```

---

## Fresh Context Pattern

| Task Call | Warum Fresh Context |
|-----------|---------------------|
| `slim-slicer` | Objektive Decomposition ohne Planner-Bias |
| `slim-slice-writer` | Schreibt ohne Vorwissen über vorherige Versuche |
| `slim-slice-compliance` | Prüft unabhängig, keine Confirmation Bias |
| `integration-map` | Sieht alle Slices neutral |

---

## Referenzen

- Slicer: `${CLAUDE_PLUGIN_ROOT}/agents/slim-slicer.md`
- Slim Writer: `${CLAUDE_PLUGIN_ROOT}/agents/slim-slice-writer.md`
- Slim Compliance: `${CLAUDE_PLUGIN_ROOT}/agents/slim-slice-compliance.md`
- Slim Template: `${CLAUDE_PLUGIN_ROOT}/templates/slim-plan-spec.md`
- Integration Map: `${CLAUDE_PLUGIN_ROOT}/agents/integration-map.md`
