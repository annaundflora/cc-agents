/**
 * Acceptance Tests for Slice 04: Worktree-Erstellung in Orchestrator Phase 2
 *
 * Stack: markdown-commands (structural file checks with Node.js built-ins)
 * Run: node specs/2026-03-08-conflict-aware-pipeline/slices/slice-04-worktree-erstellung-orchestrator-phase-2.test.js
 *
 * Each test validates an Acceptance Criterion from the slice spec.
 * Exit code 1 on any failure.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const ORCHESTRATE_PATH = path.join(REPO_ROOT, 'plugins', 'clemens', 'commands', 'orchestrate.md');
const SLIM_ORCHESTRATE_PATH = path.join(REPO_ROOT, 'plugins', 'clemens', 'commands', 'slim-orchestrate.md');

let passed = 0;
let failed = 0;
const results = [];

function test(acId, description, fn) {
  try {
    fn();
    passed++;
    results.push({ ac: acId, status: 'PASS', description });
    console.log(`PASS  ${acId}: ${description}`);
  } catch (err) {
    failed++;
    results.push({ ac: acId, status: 'FAIL', description, error: err.message });
    console.log(`FAIL  ${acId}: ${description}`);
    console.log(`      Error: ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// Load file contents
const orchestrateContent = fs.readFileSync(ORCHESTRATE_PATH, 'utf-8');
const slimOrchestrateContent = fs.readFileSync(SLIM_ORCHESTRATE_PATH, 'utf-8');
const orchestrateLines = orchestrateContent.split('\n');
const slimOrchestrateLines = slimOrchestrateContent.split('\n');

// ============================================================================
// AC-1: orchestrate.md -- Worktree block position in Phase 2
// GIVEN `plugins/clemens/commands/orchestrate.md` Phase 2 wird gelesen
// WHEN der Implementer den Worktree-Block einfuegt
// THEN steht er nach der State-Initialisierung (nach dem `state = {` Block)
//      und vor Phase 2b (Stack Detection)
// ============================================================================

test('AC-1a', 'Worktree block in orchestrate.md is AFTER the state = { block', function () {
  const stateBlockIndex = orchestrateLines.findIndex(line => /^\s*state\s*=\s*\{/.test(line));
  assert(stateBlockIndex !== -1, 'Could not find "state = {" block in orchestrate.md');

  // Find the closing of the state block (next line with just "}")
  let stateBlockEnd = -1;
  for (let i = stateBlockIndex + 1; i < orchestrateLines.length; i++) {
    if (/^\s*\}/.test(orchestrateLines[i])) {
      stateBlockEnd = i;
      break;
    }
  }
  assert(stateBlockEnd !== -1, 'Could not find closing "}" of state block in orchestrate.md');

  // Find worktree-related content (git worktree add or worktree_check or worktree)
  const worktreeIndex = orchestrateLines.findIndex(line =>
    /worktree.*add|git worktree|worktree_check|Worktree-Erstellung/i.test(line)
  );
  assert(worktreeIndex !== -1, 'Could not find worktree block in orchestrate.md');
  assert(worktreeIndex > stateBlockEnd,
    `Worktree block (line ${worktreeIndex + 1}) must be AFTER state block end (line ${stateBlockEnd + 1})`);
});

test('AC-1b', 'Worktree block in orchestrate.md is BEFORE the ## Phase 2b header', function () {
  const phase2bIndex = orchestrateLines.findIndex(line => /^#+\s*Phase 2b/.test(line));
  assert(phase2bIndex !== -1, 'Could not find "## Phase 2b" header in orchestrate.md');

  const worktreeIndex = orchestrateLines.findIndex(line =>
    /worktree.*add|git worktree|worktree_check|Worktree-Erstellung/i.test(line)
  );
  assert(worktreeIndex !== -1, 'Could not find worktree block in orchestrate.md');
  assert(worktreeIndex < phase2bIndex,
    `Worktree block (line ${worktreeIndex + 1}) must be BEFORE Phase 2b header (line ${phase2bIndex + 1})`);
});

// ============================================================================
// AC-2: slim-orchestrate.md -- Worktree block position in Phase 2
// GIVEN `plugins/clemens/commands/slim-orchestrate.md` Phase 2 wird gelesen
// WHEN der Implementer den Worktree-Block einfuegt
// THEN steht er nach der State-Initialisierung (nach dem `state = {` Block
//      inklusive Resume-Logik) und vor `## Phase 2b: Stack Detection`
// ============================================================================

test('AC-2a', 'Worktree block in slim-orchestrate.md is AFTER the state = { block (incl. Resume logic)', function () {
  const stateBlockIndex = slimOrchestrateLines.findIndex(line => /^\s*state\s*=\s*\{/.test(line));
  assert(stateBlockIndex !== -1, 'Could not find "state = {" block in slim-orchestrate.md');

  // Find Resume-Logik section (IF EXISTS STATE_FILE)
  const resumeIndex = slimOrchestrateLines.findIndex((line, idx) =>
    idx > stateBlockIndex && /IF EXISTS STATE_FILE|Resume-Logik|Resume/.test(line)
  );
  assert(resumeIndex !== -1, 'Could not find Resume logic after state block in slim-orchestrate.md');

  // Find worktree-related content
  const worktreeIndex = slimOrchestrateLines.findIndex(line =>
    /worktree.*add|git worktree|worktree_check|Worktree-Erstellung/i.test(line)
  );
  assert(worktreeIndex !== -1, 'Could not find worktree block in slim-orchestrate.md');
  assert(worktreeIndex > resumeIndex,
    `Worktree block (line ${worktreeIndex + 1}) must be AFTER Resume logic (line ${resumeIndex + 1})`);
});

test('AC-2b', 'Worktree block in slim-orchestrate.md is BEFORE ## Phase 2b: Stack Detection', function () {
  const phase2bIndex = slimOrchestrateLines.findIndex(line => /^#+\s*Phase 2b.*Stack Detection/i.test(line));
  assert(phase2bIndex !== -1, 'Could not find "## Phase 2b: Stack Detection" header in slim-orchestrate.md');

  const worktreeIndex = slimOrchestrateLines.findIndex(line =>
    /worktree.*add|git worktree|worktree_check|Worktree-Erstellung/i.test(line)
  );
  assert(worktreeIndex !== -1, 'Could not find worktree block in slim-orchestrate.md');
  assert(worktreeIndex < phase2bIndex,
    `Worktree block (line ${worktreeIndex + 1}) must be BEFORE Phase 2b header (line ${phase2bIndex + 1})`);
});

// ============================================================================
// AC-3: Worktree creation command and state fields
// GIVEN ein neuer Pipeline-Start ohne existierenden Worktree
// WHEN der Worktree-Block ausgefuehrt wird
// THEN enthaelt er den Befehl `git worktree add worktrees/{feature_name} -b feature/{feature_name}`
//      und schreibt `worktree_path` sowie `branch` in das State-Objekt
// ============================================================================

test('AC-3a', 'orchestrate.md contains "git worktree add worktrees/" command', function () {
  const hasWorktreeAdd = /git worktree add worktrees\//.test(orchestrateContent);
  assert(hasWorktreeAdd, 'orchestrate.md must contain "git worktree add worktrees/{feature_name}" command');
});

test('AC-3b', 'slim-orchestrate.md contains "git worktree add worktrees/" command', function () {
  const hasWorktreeAdd = /git worktree add worktrees\//.test(slimOrchestrateContent);
  assert(hasWorktreeAdd, 'slim-orchestrate.md must contain "git worktree add worktrees/{feature_name}" command');
});

test('AC-3c', 'orchestrate.md sets state.worktree_path', function () {
  const hasWorktreePath = /state\.worktree_path\s*=\s*["']?worktrees\//.test(orchestrateContent);
  assert(hasWorktreePath, 'orchestrate.md must set state.worktree_path = "worktrees/{feature_name}"');
});

test('AC-3d', 'orchestrate.md sets state.branch', function () {
  const hasBranch = /state\.branch\s*=\s*["']?feature\//.test(orchestrateContent);
  assert(hasBranch, 'orchestrate.md must set state.branch = "feature/{feature_name}"');
});

test('AC-3e', 'slim-orchestrate.md sets state.worktree_path', function () {
  const hasWorktreePath = /state\.worktree_path\s*=\s*["']?worktrees\//.test(slimOrchestrateContent);
  assert(hasWorktreePath, 'slim-orchestrate.md must set state.worktree_path = "worktrees/{feature_name}"');
});

test('AC-3f', 'slim-orchestrate.md sets state.branch', function () {
  const hasBranch = /state\.branch\s*=\s*["']?feature\//.test(slimOrchestrateContent);
  assert(hasBranch, 'slim-orchestrate.md must set state.branch = "feature/{feature_name}"');
});

// ============================================================================
// AC-4: Existence check before git worktree add (idempotency)
// GIVEN ein Worktree unter `worktrees/{feature_name}/` existiert bereits
// WHEN der Worktree-Block prueft ob der Worktree vorhanden ist
// THEN wird `git worktree add` NICHT erneut ausgefuehrt -- der Block enthaelt
//      einen Existenz-Check und ueberspringt die Erstellung
// ============================================================================

test('AC-4a', 'orchestrate.md has existence check before git worktree add', function () {
  // Find the worktree block and check for existence check pattern
  const hasExistenceCheck = /git worktree list|worktree_check|Glob.*worktrees|IF NOT.*worktree/i.test(orchestrateContent);
  assert(hasExistenceCheck, 'orchestrate.md must contain an existence check (git worktree list or filesystem check)');
});

test('AC-4b', 'slim-orchestrate.md has existence check before git worktree add', function () {
  const hasExistenceCheck = /git worktree list|worktree_check|Glob.*worktrees|IF NOT.*worktree/i.test(slimOrchestrateContent);
  assert(hasExistenceCheck, 'slim-orchestrate.md must contain an existence check (git worktree list or filesystem check)');
});

test('AC-4c', 'orchestrate.md: existence check appears BEFORE git worktree add command', function () {
  const lines = orchestrateLines;
  const checkIndex = lines.findIndex(line => /git worktree list|worktree_check\s*=/.test(line));
  const addIndex = lines.findIndex(line => /git worktree add/.test(line));
  assert(checkIndex !== -1, 'Could not find existence check in orchestrate.md');
  assert(addIndex !== -1, 'Could not find "git worktree add" in orchestrate.md');
  assert(checkIndex < addIndex,
    `Existence check (line ${checkIndex + 1}) must appear BEFORE "git worktree add" (line ${addIndex + 1})`);
});

test('AC-4d', 'slim-orchestrate.md: existence check appears BEFORE git worktree add command', function () {
  const lines = slimOrchestrateLines;
  const checkIndex = lines.findIndex(line => /git worktree list|worktree_check\s*=/.test(line));
  const addIndex = lines.findIndex(line => /git worktree add/.test(line));
  assert(checkIndex !== -1, 'Could not find existence check in slim-orchestrate.md');
  assert(addIndex !== -1, 'Could not find "git worktree add" in slim-orchestrate.md');
  assert(checkIndex < addIndex,
    `Existence check (line ${checkIndex + 1}) must appear BEFORE "git worktree add" (line ${addIndex + 1})`);
});

test('AC-4e', 'orchestrate.md: git worktree add is conditional (inside IF/ELSE)', function () {
  // The "git worktree add" should be inside a conditional block (IF NOT ... or similar)
  const addLineIdx = orchestrateLines.findIndex(line => /git worktree add/.test(line));
  assert(addLineIdx !== -1, 'Could not find "git worktree add" in orchestrate.md');

  // Look backwards from the add line for an IF/conditional
  let foundConditional = false;
  for (let i = addLineIdx - 1; i >= Math.max(0, addLineIdx - 5); i--) {
    if (/IF\s+NOT|IF\s+!|IF NOT|ELSE/i.test(orchestrateLines[i])) {
      foundConditional = true;
      break;
    }
  }
  assert(foundConditional,
    'git worktree add must be inside a conditional block (IF NOT / ELSE) in orchestrate.md');
});

// ============================================================================
// AC-5: orchestrate.md Phase 5 cleanup commands
// GIVEN `plugins/clemens/commands/orchestrate.md` Phase 5 wird gelesen
// WHEN der Implementer den Cleanup-Hinweis einfuegt
// THEN enthaelt Phase 5 `git worktree remove worktrees/{feature_name}` und `git worktree prune`
// ============================================================================

test('AC-5a', 'Phase 5 in orchestrate.md contains "git worktree remove"', function () {
  // Find Phase 5 section
  const phase5Index = orchestrateLines.findIndex(line => /^#+\s*Phase 5/i.test(line));
  assert(phase5Index !== -1, 'Could not find Phase 5 header in orchestrate.md');

  const phase5Content = orchestrateLines.slice(phase5Index).join('\n');
  const hasWorktreeRemove = /git worktree remove\s+worktrees\//.test(phase5Content);
  assert(hasWorktreeRemove, 'Phase 5 in orchestrate.md must contain "git worktree remove worktrees/{feature_name}"');
});

test('AC-5b', 'Phase 5 in orchestrate.md contains "git worktree prune"', function () {
  const phase5Index = orchestrateLines.findIndex(line => /^#+\s*Phase 5/i.test(line));
  assert(phase5Index !== -1, 'Could not find Phase 5 header in orchestrate.md');

  const phase5Content = orchestrateLines.slice(phase5Index).join('\n');
  const hasWorktreePrune = /git worktree prune/.test(phase5Content);
  assert(hasWorktreePrune, 'Phase 5 in orchestrate.md must contain "git worktree prune"');
});

// ============================================================================
// AC-6: slim-orchestrate.md Phase 5 cleanup commands
// GIVEN `plugins/clemens/commands/slim-orchestrate.md` Phase 5 wird gelesen
// WHEN der Implementer den Cleanup-Hinweis einfuegt
// THEN enthaelt Phase 5 denselben Cleanup-Hinweis wie orchestrate.md
// ============================================================================

test('AC-6a', 'Phase 5 in slim-orchestrate.md contains "git worktree remove"', function () {
  const phase5Index = slimOrchestrateLines.findIndex(line => /^#+\s*Phase 5/i.test(line));
  assert(phase5Index !== -1, 'Could not find Phase 5 header in slim-orchestrate.md');

  const phase5Content = slimOrchestrateLines.slice(phase5Index).join('\n');
  const hasWorktreeRemove = /git worktree remove\s+worktrees\//.test(phase5Content);
  assert(hasWorktreeRemove, 'Phase 5 in slim-orchestrate.md must contain "git worktree remove worktrees/{feature_name}"');
});

test('AC-6b', 'Phase 5 in slim-orchestrate.md contains "git worktree prune"', function () {
  const phase5Index = slimOrchestrateLines.findIndex(line => /^#+\s*Phase 5/i.test(line));
  assert(phase5Index !== -1, 'Could not find Phase 5 header in slim-orchestrate.md');

  const phase5Content = slimOrchestrateLines.slice(phase5Index).join('\n');
  const hasWorktreePrune = /git worktree prune/.test(phase5Content);
  assert(hasWorktreePrune, 'Phase 5 in slim-orchestrate.md must contain "git worktree prune"');
});

// ============================================================================
// Summary
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('='.repeat(60));

if (failed > 0) {
  console.log('\nFailed tests:');
  results.filter(r => r.status === 'FAIL').forEach(r => {
    console.log(`  ${r.ac}: ${r.description}`);
    console.log(`    -> ${r.error}`);
  });
  process.exit(1);
} else {
  console.log('\nAll acceptance criteria verified.');
  process.exit(0);
}
