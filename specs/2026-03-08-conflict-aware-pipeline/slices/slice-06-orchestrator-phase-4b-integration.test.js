/**
 * Structural Tests for Slice 06: Orchestrator Phase 4b Integration
 *
 * Verifies that Phase 4b (Conflict Scan) was correctly inserted into both
 * orchestrate.md and slim-orchestrate.md, with proper positioning, content,
 * and state-machine documentation.
 *
 * Run: node specs/2026-03-08-conflict-aware-pipeline/slices/slice-06-orchestrator-phase-4b-integration.test.js
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const ORCHESTRATE_PATH = path.join(REPO_ROOT, 'plugins', 'clemens', 'commands', 'orchestrate.md');
const SLIM_ORCHESTRATE_PATH = path.join(REPO_ROOT, 'plugins', 'clemens', 'commands', 'slim-orchestrate.md');

let passed = 0;
let failed = 0;
const results = [];

function check(acId, description, condition) {
  if (condition) {
    passed++;
    results.push({ ac: acId, desc: description, result: 'PASS' });
    console.log(`  PASS  ${acId}: ${description}`);
  } else {
    failed++;
    results.push({ ac: acId, desc: description, result: 'FAIL' });
    console.log(`  FAIL  ${acId}: ${description}`);
  }
}

// ─── Load files ───

let orchestrateContent, slimContent;
try {
  orchestrateContent = fs.readFileSync(ORCHESTRATE_PATH, 'utf-8').replace(/\r\n/g, '\n');
} catch (e) {
  console.error(`FATAL: Cannot read ${ORCHESTRATE_PATH}: ${e.message}`);
  process.exit(1);
}
try {
  slimContent = fs.readFileSync(SLIM_ORCHESTRATE_PATH, 'utf-8').replace(/\r\n/g, '\n');
} catch (e) {
  console.error(`FATAL: Cannot read ${SLIM_ORCHESTRATE_PATH}: ${e.message}`);
  process.exit(1);
}

// ─── Helper: Find heading positions ───

function findHeadingPosition(content, headingPattern) {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(headingPattern)) {
      return i;
    }
  }
  return -1;
}

function findAllHeadingPositions(content, headingPattern) {
  const lines = content.split('\n');
  const positions = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(headingPattern)) {
      positions.push(i);
    }
  }
  return positions;
}

// Extract the Phase 4b block content from a file
function extractPhase4bBlock(content) {
  const match = content.match(/## Phase 4b[\s\S]*?(?=\n---\n|$)/);
  return match ? match[0] : '';
}

// Extract the state block (Phase 2 setup) from a file
function extractStateBlock(content) {
  const match = content.match(/## Phase 2: Setup[\s\S]*?(?=\n---\n)/);
  return match ? match[0] : '';
}

// ═══════════════════════════════════════════════════════════════
// AC-1: Phase 4b in orchestrate.md steht nach Phase 4 und vor Phase 5
// ═══════════════════════════════════════════════════════════════

console.log('\n── AC-1: Phase 4b position in orchestrate.md ──');

const orch_phase4_pos = findHeadingPosition(orchestrateContent, /^## Phase 4[:\s]/);
const orch_phase4b_pos = findHeadingPosition(orchestrateContent, /^## Phase 4b/);
const orch_phase5_pos = findHeadingPosition(orchestrateContent, /^## Phase 5/);

check('AC-1', 'Phase 4b heading exists in orchestrate.md', orch_phase4b_pos !== -1);
check('AC-1', 'Phase 4 heading exists in orchestrate.md', orch_phase4_pos !== -1);
check('AC-1', 'Phase 5 heading exists in orchestrate.md', orch_phase5_pos !== -1);
check('AC-1', 'Phase 4b comes after Phase 4 in orchestrate.md', orch_phase4b_pos > orch_phase4_pos);
check('AC-1', 'Phase 4b comes before Phase 5 in orchestrate.md', orch_phase4b_pos < orch_phase5_pos);

// Verify no unexpected content between Phase 4 end and Phase 4b start:
// Phase 4 block ends at a "---" separator; Phase 4b should follow immediately after that separator.
const orch_lines = orchestrateContent.split('\n');
let orch_separator_before_4b = -1;
for (let i = orch_phase4b_pos - 1; i > orch_phase4_pos; i--) {
  if (orch_lines[i].trim() === '---') {
    orch_separator_before_4b = i;
    break;
  }
}
// Between the separator and Phase 4b heading, only blank lines are allowed
let orch_clean_between = true;
if (orch_separator_before_4b !== -1) {
  for (let i = orch_separator_before_4b + 1; i < orch_phase4b_pos; i++) {
    if (orch_lines[i].trim() !== '') {
      orch_clean_between = false;
      break;
    }
  }
} else {
  orch_clean_between = false;
}
check('AC-1', 'No unexpected content between Phase 4 block and Phase 4b in orchestrate.md', orch_clean_between);

// ═══════════════════════════════════════════════════════════════
// AC-2: Phase 4b in slim-orchestrate.md steht nach Phase 4 und vor Phase 5
// ═══════════════════════════════════════════════════════════════

console.log('\n── AC-2: Phase 4b position in slim-orchestrate.md ──');

const slim_phase4_pos = findHeadingPosition(slimContent, /^## Phase 4[:\s]/);
const slim_phase4b_pos = findHeadingPosition(slimContent, /^## Phase 4b/);
const slim_phase5_pos = findHeadingPosition(slimContent, /^## Phase 5/);

check('AC-2', 'Phase 4b heading exists in slim-orchestrate.md', slim_phase4b_pos !== -1);
check('AC-2', 'Phase 4 heading exists in slim-orchestrate.md', slim_phase4_pos !== -1);
check('AC-2', 'Phase 5 heading exists in slim-orchestrate.md', slim_phase5_pos !== -1);
check('AC-2', 'Phase 4b comes after Phase 4 in slim-orchestrate.md', slim_phase4b_pos > slim_phase4_pos);
check('AC-2', 'Phase 4b comes before Phase 5 in slim-orchestrate.md', slim_phase4b_pos < slim_phase5_pos);

// Verify no unexpected content between Phase 4 end and Phase 4b start
const slim_lines = slimContent.split('\n');
let slim_separator_before_4b = -1;
for (let i = slim_phase4b_pos - 1; i > slim_phase4_pos; i--) {
  if (slim_lines[i].trim() === '---') {
    slim_separator_before_4b = i;
    break;
  }
}
let slim_clean_between = true;
if (slim_separator_before_4b !== -1) {
  for (let i = slim_separator_before_4b + 1; i < slim_phase4b_pos; i++) {
    if (slim_lines[i].trim() !== '') {
      slim_clean_between = false;
      break;
    }
  }
} else {
  slim_clean_between = false;
}
check('AC-2', 'No unexpected content between Phase 4 block and Phase 4b in slim-orchestrate.md', slim_clean_between);

// ═══════════════════════════════════════════════════════════════
// AC-3: Step 1 contains conflict-scanner.js call with correct args
// Checked in BOTH files
// ═══════════════════════════════════════════════════════════════

console.log('\n── AC-3: Step 1 script call (both files) ──');

const orch_phase4b_block = extractPhase4bBlock(orchestrateContent);
const slim_phase4b_block = extractPhase4bBlock(slimContent);

for (const [label, block] of [['orchestrate.md', orch_phase4b_block], ['slim-orchestrate.md', slim_phase4b_block]]) {
  check('AC-3', `Step 1 contains conflict-scanner.js in ${label}`,
    block.includes('conflict-scanner.js'));
  check('AC-3', `Step 1 contains --branch {state.branch} in ${label}`,
    /--branch\s+\{state\.branch\}/.test(block));
  check('AC-3', `Step 1 contains --spec-path {state.spec_path} in ${label}`,
    /--spec-path\s+\{state\.spec_path\}/.test(block));
  check('AC-3', `Step 1 contains --repo in ${label}`,
    /--repo\s+\{repo\}/.test(block));
  // Exit code stored in variable
  check('AC-3', `Exit code stored in variable in ${label}`,
    /exit_code/.test(block) || /scan_exit_code/.test(block) || /exitCode/.test(block));
}

// ═══════════════════════════════════════════════════════════════
// AC-4: Exit-Code 1 -> Task("conflict-reporter"), overlap_report_path +
//        own_issue_number + repo, parse_agent_json(), state.current_state = "conflict_report"
// ═══════════════════════════════════════════════════════════════

console.log('\n── AC-4: Exit-Code 1 branch (both files) ──');

for (const [label, block] of [['orchestrate.md', orch_phase4b_block], ['slim-orchestrate.md', slim_phase4b_block]]) {
  // Task("conflict-reporter") called
  check('AC-4', `Task("conflict-reporter") called on exit code 1 in ${label}`,
    /Task\(\s*"conflict-reporter"/.test(block));

  // overlap_report_path in Task args
  check('AC-4', `Task args contain overlap_report_path in ${label}`,
    block.includes('overlap_report_path'));

  // own_issue_number in Task args
  check('AC-4', `Task args contain own_issue_number in ${label}`,
    block.includes('own_issue_number'));

  // repo in Task args
  check('AC-4', `Task args contain repo in ${label}`,
    /repo:\s*repo/.test(block) || /repo:\s+\{?repo\}?/.test(block));

  // parse_agent_json() used
  check('AC-4', `parse_agent_json() used in ${label}`,
    block.includes('parse_agent_json'));

  // state.current_state = "conflict_report"
  check('AC-4', `state.current_state = "conflict_report" set on exit code 1 in ${label}`,
    /current_state\s*=\s*"conflict_report"/.test(block));
}

// ═══════════════════════════════════════════════════════════════
// AC-5: Exit-Code 0 -> no Task(), state.current_state = "conflict_scan"
// ═══════════════════════════════════════════════════════════════

console.log('\n── AC-5: Exit-Code 0 branch (both files) ──');

for (const [label, block] of [['orchestrate.md', orch_phase4b_block], ['slim-orchestrate.md', slim_phase4b_block]]) {
  // state.current_state = "conflict_scan"
  check('AC-5', `state.current_state = "conflict_scan" set on exit code 0 in ${label}`,
    /current_state\s*=\s*"conflict_scan"/.test(block));

  // Verify exit code 0 branch does NOT call Task
  // We check that the exit-code-0 branch (ELIF scan_exit_code == 0) does not contain Task(
  const exitCode0Match = block.match(/(?:ELIF|else\s*if|IF)\s+scan_exit_code\s*==\s*0[\s\S]*?(?=ELIF|else\s*if|ELSE|#\s*Step\s*3|$)/i);
  if (exitCode0Match) {
    check('AC-5', `No Task() call in exit code 0 branch in ${label}`,
      !exitCode0Match[0].includes('Task('));
  } else {
    check('AC-5', `Exit code 0 branch found in ${label}`, false);
  }
}

// ═══════════════════════════════════════════════════════════════
// AC-6: Exit-Code 2 -> Warning with stderr, NO state.current_state change
// ═══════════════════════════════════════════════════════════════

console.log('\n── AC-6: Exit-Code 2 branch (both files) ──');

for (const [label, block] of [['orchestrate.md', orch_phase4b_block], ['slim-orchestrate.md', slim_phase4b_block]]) {
  // Exit code 2 branch exists
  const exitCode2Match = block.match(/(?:ELIF|else\s*if|IF)\s+scan_exit_code\s*==\s*2[\s\S]*?(?=\n#\s*Step\s*3|\n##|$)/i);
  check('AC-6', `Exit code 2 branch exists in ${label}`, !!exitCode2Match);

  // Warning text with stderr
  if (exitCode2Match) {
    check('AC-6', `Warning text contains stderr reference in ${label}`,
      /[Ww]arning.*(?:stderr|scan_result\.stderr)/.test(exitCode2Match[0]) ||
      /Conflict scan failed.*stderr/.test(exitCode2Match[0]) ||
      exitCode2Match[0].includes('stderr'));

    // No state.current_state assignment in exit code 2 branch
    check('AC-6', `No state.current_state change in exit code 2 branch in ${label}`,
      !/current_state\s*=/.test(exitCode2Match[0]));
  } else {
    check('AC-6', `Warning text contains stderr reference in ${label}`, false);
    check('AC-6', `No state.current_state change in exit code 2 branch in ${label}`, false);
  }
}

// ═══════════════════════════════════════════════════════════════
// AC-7: Step 3 contains gh issue edit with label changes
// ═══════════════════════════════════════════════════════════════

console.log('\n── AC-7: Step 3 label change (both files) ──');

for (const [label, block] of [['orchestrate.md', orch_phase4b_block], ['slim-orchestrate.md', slim_phase4b_block]]) {
  check('AC-7', `Step 3 contains "gh issue edit" in ${label}`,
    block.includes('gh issue edit'));

  check('AC-7', `Step 3 contains --remove-label pipeline:running in ${label}`,
    block.includes('--remove-label pipeline:running'));

  check('AC-7', `Step 3 contains --add-label pipeline:merge-ready in ${label}`,
    block.includes('--add-label pipeline:merge-ready'));

  // Step 3 is reachable from all exit codes (it follows the IF/ELIF/ELIF block)
  // We verify Step 3 exists outside/after the conditional block
  const step3Comment = block.match(/#\s*Step\s*3/i);
  check('AC-7', `Step 3 section exists (runs for all exit codes) in ${label}`, !!step3Comment);
}

// ═══════════════════════════════════════════════════════════════
// AC-8: State block documents "conflict_scan" and "conflict_report"
// ═══════════════════════════════════════════════════════════════

console.log('\n── AC-8: State documentation (both files) ──');

const orch_state_block = extractStateBlock(orchestrateContent);
const slim_state_block = extractStateBlock(slimContent);

check('AC-8', 'State block in orchestrate.md contains "conflict_scan"',
  orch_state_block.includes('conflict_scan'));
check('AC-8', 'State block in orchestrate.md contains "conflict_report"',
  orch_state_block.includes('conflict_report'));
check('AC-8', 'State block in slim-orchestrate.md contains "conflict_scan"',
  slim_state_block.includes('conflict_scan'));
check('AC-8', 'State block in slim-orchestrate.md contains "conflict_report"',
  slim_state_block.includes('conflict_report'));

// ═══════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════

console.log('\n══════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed (${passed + failed} total)`);
console.log('══════════════════════════════════════════\n');

if (failed > 0) {
  console.log('FAILED checks:');
  results.filter(r => r.result === 'FAIL').forEach(r => {
    console.log(`  - ${r.ac}: ${r.desc}`);
  });
  console.log('');
}

process.exit(failed > 0 ? 1 : 0);
