#!/usr/bin/env node
/**
 * conflict-scanner.test.js
 *
 * Minimal test runner for conflict-scanner.js (Slice 02).
 * Stack: node-script-no-framework — uses only Node.js built-ins.
 * Mocking Strategy: mock_external — git via temporary repos with real commits,
 *   weave-cli via PATH manipulation with executable mocks.
 *
 * Run: node plugins/clemens/scripts/conflict-scanner.test.js
 */

'use strict';

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// Minimal Test Runner
// ---------------------------------------------------------------------------

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function describe(suite, fn) {
  console.log(`\n  ${suite}`);
  fn();
}

function it(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`    PASS  ${name}`);
  } catch (err) {
    failedTests++;
    const msg = err.message || String(err);
    failures.push({ name, msg });
    console.log(`    FAIL  ${name}`);
    console.log(`          ${msg}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      `${label || 'assertEqual'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertIncludes(haystack, needle, label) {
  if (typeof haystack === 'string') {
    if (!haystack.includes(needle)) {
      throw new Error(
        `${label || 'assertIncludes'}: expected string to include ${JSON.stringify(needle)}, got ${JSON.stringify(haystack)}`
      );
    }
  } else if (Array.isArray(haystack)) {
    if (!haystack.includes(needle)) {
      throw new Error(
        `${label || 'assertIncludes'}: expected array to include ${JSON.stringify(needle)}, got ${JSON.stringify(haystack)}`
      );
    }
  } else {
    throw new Error(`${label || 'assertIncludes'}: haystack must be string or array`);
  }
}

function assertMatch(str, regex, label) {
  if (!regex.test(str)) {
    throw new Error(
      `${label || 'assertMatch'}: expected ${JSON.stringify(str)} to match ${regex}`
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SCRIPT_PATH = path.resolve(__dirname, 'conflict-scanner.js');
const IS_WINDOWS = process.platform === 'win32';

/**
 * Create a temporary directory that will serve as --spec-path.
 */
function makeTempSpecPath() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cs-test-spec-'));
}

/**
 * Remove a temp directory safely.
 */
function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) { /* ignore */ }
}

/**
 * Run a git command in a directory, returning stdout.
 */
function gitInDir(dir, args) {
  return execSync(`git ${args}`, {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, {
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@test.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@test.com',
    }),
  });
}

/**
 * Create a temporary git repository with a main branch and a feature branch
 * that has specific changes to produce known hunk headers.
 *
 * @param {Object} opts
 * @param {'function'|'class'|'no_funcname'|'new_file'|'mixed'} opts.diffType
 * @returns {{ repoDir: string, specPath: string, branch: string, cleanup: () => void }}
 */
function createTestRepo(opts = {}) {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-test-repo-'));
  const specPath = path.join(repoDir, 'spec');
  fs.mkdirSync(specPath);

  gitInDir(repoDir, 'init -b main');
  gitInDir(repoDir, 'config commit.gpgsign false');

  const diffType = opts.diffType || 'function';
  const branch = 'feature/test';

  if (diffType === 'function') {
    // Create a file with a function on main, then modify it on feature branch
    const filePath = path.join(repoDir, 'src', 'components');
    fs.mkdirSync(filePath, { recursive: true });
    const file = path.join(filePath, 'PromptArea.tsx');
    // Write initial file with enough lines so the hunk header shows "function PromptArea()"
    const initialLines = [];
    for (let i = 0; i < 40; i++) initialLines.push(`// line ${i + 1}`);
    initialLines.push('');
    initialLines.push('function PromptArea() {');
    for (let i = 0; i < 10; i++) initialLines.push(`  // body line ${i + 1}`);
    initialLines.push('}');
    fs.writeFileSync(file, initialLines.join('\n'));
    gitInDir(repoDir, 'add -A');
    gitInDir(repoDir, 'commit -m "initial"');

    gitInDir(repoDir, `checkout -b ${branch}`);
    // Modify lines inside the function (after line 42 where function starts)
    const modified = [...initialLines];
    // Insert lines after the function declaration (index 41 is "function PromptArea() {")
    modified.splice(42, 0, '  // new line 1', '  // new line 2', '  // new line 3', '  // new line 4', '  // new line 5');
    fs.writeFileSync(file, modified.join('\n'));
    gitInDir(repoDir, 'add -A');
    gitInDir(repoDir, 'commit -m "modify PromptArea"');
  } else if (diffType === 'class') {
    const filePath = path.join(repoDir, 'src', 'services');
    fs.mkdirSync(filePath, { recursive: true });
    const file = path.join(filePath, 'UserService.ts');
    const initialLines = [];
    for (let i = 0; i < 8; i++) initialLines.push(`// line ${i + 1}`);
    initialLines.push('');
    initialLines.push('class UserService {');
    for (let i = 0; i < 3; i++) initialLines.push(`  // method ${i + 1}`);
    initialLines.push('}');
    fs.writeFileSync(file, initialLines.join('\n'));
    gitInDir(repoDir, 'add -A');
    gitInDir(repoDir, 'commit -m "initial"');

    gitInDir(repoDir, `checkout -b ${branch}`);
    const modified = [...initialLines];
    // Insert lines inside the class body
    modified.splice(11, 0, '  // new method 1', '  // new method 2', '  // new method 3', '  // new method 4', '  // new method 5');
    fs.writeFileSync(file, modified.join('\n'));
    gitInDir(repoDir, 'add -A');
    gitInDir(repoDir, 'commit -m "modify UserService"');
  } else if (diffType === 'no_funcname') {
    const file = path.join(repoDir, 'config.json');
    const initialLines = [];
    for (let i = 0; i < 15; i++) initialLines.push(`"key${i}": "value${i}",`);
    fs.writeFileSync(file, initialLines.join('\n'));
    gitInDir(repoDir, 'add -A');
    gitInDir(repoDir, 'commit -m "initial"');

    gitInDir(repoDir, `checkout -b ${branch}`);
    const modified = [...initialLines];
    modified[10] = '"key10": "modified_value",';
    fs.writeFileSync(file, modified.join('\n'));
    gitInDir(repoDir, 'add -A');
    gitInDir(repoDir, 'commit -m "modify config"');
  } else if (diffType === 'new_file') {
    // Create a dummy file on main so the repo isn't empty
    fs.writeFileSync(path.join(repoDir, 'README.md'), '# Test');
    gitInDir(repoDir, 'add -A');
    gitInDir(repoDir, 'commit -m "initial"');

    gitInDir(repoDir, `checkout -b ${branch}`);
    const newDir = path.join(repoDir, 'src', 'utils');
    fs.mkdirSync(newDir, { recursive: true });
    const lines = [];
    for (let i = 0; i < 45; i++) lines.push(`// new helper line ${i + 1}`);
    fs.writeFileSync(path.join(newDir, 'newHelper.ts'), lines.join('\n'));
    gitInDir(repoDir, 'add -A');
    gitInDir(repoDir, 'commit -m "add new file"');
  } else if (diffType === 'two_new_files') {
    fs.writeFileSync(path.join(repoDir, 'README.md'), '# Test');
    gitInDir(repoDir, 'add -A');
    gitInDir(repoDir, 'commit -m "initial"');

    gitInDir(repoDir, `checkout -b ${branch}`);
    fs.mkdirSync(path.join(repoDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'src', 'a.ts'), Array(10).fill('// line').join('\n'));
    fs.writeFileSync(path.join(repoDir, 'src', 'b.ts'), Array(20).fill('// line').join('\n'));
    gitInDir(repoDir, 'add -A');
    gitInDir(repoDir, 'commit -m "add two new files"');
  } else if (diffType === 'mixed') {
    // Create files on main
    const srcDir = path.join(repoDir, 'src');
    fs.mkdirSync(path.join(srcDir, 'components'), { recursive: true });
    fs.mkdirSync(path.join(srcDir, 'services'), { recursive: true });

    // File with function
    const funcLines = [];
    for (let i = 0; i < 40; i++) funcLines.push(`// line ${i + 1}`);
    funcLines.push('');
    funcLines.push('function PromptArea() {');
    for (let i = 0; i < 10; i++) funcLines.push(`  // body ${i + 1}`);
    funcLines.push('}');
    fs.writeFileSync(path.join(srcDir, 'components', 'PromptArea.tsx'), funcLines.join('\n'));

    // File with class
    const classLines = [];
    for (let i = 0; i < 8; i++) classLines.push(`// line ${i + 1}`);
    classLines.push('');
    classLines.push('class UserService {');
    for (let i = 0; i < 3; i++) classLines.push(`  // method ${i + 1}`);
    classLines.push('}');
    fs.writeFileSync(path.join(srcDir, 'services', 'UserService.ts'), classLines.join('\n'));

    // Config file (no funcname)
    const configLines = [];
    for (let i = 0; i < 15; i++) configLines.push(`"key${i}": "value${i}",`);
    fs.writeFileSync(path.join(repoDir, 'config.json'), configLines.join('\n'));

    gitInDir(repoDir, 'add -A');
    gitInDir(repoDir, 'commit -m "initial"');

    gitInDir(repoDir, `checkout -b ${branch}`);

    // Modify function file
    const modFunc = [...funcLines];
    modFunc.splice(42, 0, '  // new line 1', '  // new line 2');
    fs.writeFileSync(path.join(srcDir, 'components', 'PromptArea.tsx'), modFunc.join('\n'));

    // Modify class file
    const modClass = [...classLines];
    modClass.splice(11, 0, '  // new method');
    fs.writeFileSync(path.join(srcDir, 'services', 'UserService.ts'), modClass.join('\n'));

    // Modify config
    const modConfig = [...configLines];
    modConfig[10] = '"key10": "modified",';
    fs.writeFileSync(path.join(repoDir, 'config.json'), modConfig.join('\n'));

    // Add new file
    fs.mkdirSync(path.join(srcDir, 'utils'), { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'utils', 'newHelper.ts'), Array(20).fill('// new').join('\n'));

    gitInDir(repoDir, 'add -A');
    gitInDir(repoDir, 'commit -m "mixed changes"');
  }

  return {
    repoDir,
    specPath,
    branch,
    cleanup: () => cleanupDir(repoDir),
  };
}

/**
 * Create a temporary directory with a mock weave-cli executable.
 *
 * On Windows: spawnSync without shell:true cannot find .cmd files, so we copy
 * node.exe as weave-cli.exe and use NODE_OPTIONS --require to inject a preload
 * script that outputs mock data when the process name is "weave-cli".
 *
 * On Unix: a simple shell script named "weave-cli" with execute permission.
 *
 * @param {Object} opts
 * @param {string} [opts.weaveOutput] - stdout for weave-cli
 * @param {number} [opts.weaveExitCode] - exit code for weave-cli (default 0)
 * @returns {{ mockBinDir: string, nodeOptions: string|null, cleanup: () => void }}
 */
function createWeaveMock(opts = {}) {
  const mockBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-test-weave-'));
  const outputFile = path.join(mockBinDir, '_weave_output.txt');
  fs.writeFileSync(outputFile, opts.weaveOutput || '');
  let nodeOptions = null;

  if (IS_WINDOWS) {
    // Copy node.exe as weave-cli.exe so spawnSync can find it
    fs.copyFileSync(process.execPath, path.join(mockBinDir, 'weave-cli.exe'));

    // Create a preload script that intercepts weave-cli invocations.
    // When the process binary name is "weave-cli", output mock data and exit.
    // When it's "node" (normal usage), do nothing — the preload is a no-op.
    const preloadScript = path.join(mockBinDir, '_weave_preload.js');
    const exitCode = opts.weaveExitCode || 0;
    const preloadCode = [
      'var _p = require("path");',
      'var _bn = _p.basename(process.argv[0]).replace(/\\.exe$/i, "");',
      'if (_bn === "weave-cli") {',
      '  var _fs = require("fs");',
      '  try {',
      `    var _out = _fs.readFileSync(${JSON.stringify(outputFile)}, "utf8");`,
      '    process.stdout.write(_out);',
      '  } catch(_e) {}',
      `  process.exit(${exitCode});`,
      '}',
    ].join('\n');
    fs.writeFileSync(preloadScript, preloadCode);

    nodeOptions = `--require=${JSON.stringify(preloadScript)}`;
  } else {
    const script = `#!/bin/sh\ncat "${outputFile}"\nexit ${opts.weaveExitCode || 0}\n`;
    fs.writeFileSync(path.join(mockBinDir, 'weave-cli'), script, { mode: 0o755 });
  }

  return {
    mockBinDir,
    nodeOptions,
    cleanup: () => cleanupDir(mockBinDir),
  };
}

/**
 * Run conflict-scanner.js as a subprocess.
 *
 * @param {string[]} args  CLI arguments
 * @param {Object} [opts]
 * @param {string} [opts.cwd]  working directory (for git context)
 * @param {string} [opts.prependPath]  directory to prepend to PATH
 * @param {string} [opts.nodeOptions]  value for NODE_OPTIONS env var (for weave mock on Windows)
 * @returns {{ status: number, stdout: string, stderr: string }}
 */
function runScript(args, opts = {}) {
  const env = Object.assign({}, process.env);
  if (opts.prependPath) {
    env.PATH = opts.prependPath + (IS_WINDOWS ? ';' : ':') + (env.PATH || '');
  }
  if (opts.nodeOptions) {
    env.NODE_OPTIONS = (env.NODE_OPTIONS ? env.NODE_OPTIONS + ' ' : '') + opts.nodeOptions;
  }

  const result = spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    encoding: 'utf8',
    env,
    cwd: opts.cwd || process.cwd(),
    timeout: 15000,
  });

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

// ---------------------------------------------------------------------------
// Fixtures for weave-cli mock output
// ---------------------------------------------------------------------------

const FIXTURE_WEAVE_OUTPUT = `file: src/app.ts  entity: initApp  type: function  status: modified
file: src/db.ts  entity: DbPool  type: class  status: modified
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('conflict-scanner CLI', () => {

  // =========================================================================
  // AC-1: GIVEN --branch, --spec-path und --repo fehlen alle
  //       WHEN node conflict-scanner.js ohne Argumente aufgerufen wird
  //       THEN terminiert das Script mit Exit-Code 2 und schreibt eine
  //            Fehlermeldung auf stderr die alle fehlenden Pflicht-Argumente nennt
  // =========================================================================
  it('AC-1: should exit with code 2 and write all missing args to stderr when called without arguments', () => {
    const result = runScript([]);
    assertEqual(result.status, 2, 'exit code');
    assertIncludes(result.stderr, '--branch', 'stderr mentions --branch');
    assertIncludes(result.stderr, '--spec-path', 'stderr mentions --spec-path');
    assertIncludes(result.stderr, '--repo', 'stderr mentions --repo');
  });

  // =========================================================================
  // AC-2: GIVEN --repo hat nicht das Format owner/repo
  //       WHEN das Script startet
  //       THEN terminiert es mit Exit-Code 2 und einer spezifischen Fehlermeldung
  //            auf stderr — kein leeres claims.json wird geschrieben
  // =========================================================================
  it('AC-2a: should exit with code 2 and stderr "Invalid repo format" when --repo has no slash', () => {
    const specPath = makeTempSpecPath();
    try {
      const result = runScript([
        '--branch', 'feature/test',
        '--spec-path', specPath,
        '--repo', 'noslash',
      ]);
      assertEqual(result.status, 2, 'exit code');
      assertIncludes(result.stderr, 'Invalid repo format', 'stderr contains Invalid repo format');
      // Verify no claims.json was written
      const claimsPath = path.join(specPath, 'claims.json');
      assert(!fs.existsSync(claimsPath), 'claims.json should not be written on validation error');
    } finally {
      cleanupDir(specPath);
    }
  });

  it('AC-2b: should exit with code 2 and stderr "Spec path not found" when --spec-path does not exist', () => {
    const nonExistent = path.join(os.tmpdir(), 'cs-test-nonexistent-' + Date.now());
    const result = runScript([
      '--branch', 'feature/test',
      '--spec-path', nonExistent,
      '--repo', 'owner/repo',
    ]);
    assertEqual(result.status, 2, 'exit code');
    assertIncludes(result.stderr, 'Spec path not found', 'stderr contains Spec path not found');
  });

  it('AC-2c: should exit with code 2 when --branch has no value', () => {
    const specPath = makeTempSpecPath();
    try {
      // Pass --branch without a value (next arg is --spec-path, so --branch consumes it)
      const result = runScript([
        '--branch',
        '--spec-path', specPath,
        '--repo', 'owner/repo',
      ]);
      // --branch consumes "--spec-path" as its value, so --spec-path is missing.
      // Either way, exit code 2.
      assertEqual(result.status, 2, 'exit code');
    } finally {
      cleanupDir(specPath);
    }
  });

  // =========================================================================
  // AC-3: GIVEN ein valider git diff Output mit Hunk-Headern die Entity-Namen
  //       enthalten (z.B. @@ -42,10 +42,15 @@ function PromptArea() {)
  //       WHEN das Script ohne --weave Flag laeuft
  //       THEN wird claims.json in --spec-path geschrieben mit entities_changed[]
  //            Eintraegen die entity, entity_type, file, lines und diff_summary
  //            korrekt befuellt haben
  // =========================================================================
  it('AC-3a: should extract entity with entity_type "function" from hunk header containing a function declaration', () => {
    const { repoDir, specPath, branch, cleanup } = createTestRepo({ diffType: 'function' });
    try {
      const result = runScript([
        '--branch', branch,
        '--spec-path', specPath,
        '--repo', 'owner/repo',
      ], { cwd: repoDir });
      assertEqual(result.status, 0, `exit code (stderr: ${result.stderr})`);

      const claimsPath = path.join(specPath, 'claims.json');
      assert(fs.existsSync(claimsPath), 'claims.json should exist');

      const claims = JSON.parse(fs.readFileSync(claimsPath, 'utf8'));
      assert(Array.isArray(claims.entities_changed), 'entities_changed is array');
      assert(claims.entities_changed.length > 0, 'entities_changed is non-empty');

      const entry = claims.entities_changed[0];
      // The entity should be extracted from the hunk header funcname
      assertEqual(entry.entity_type, 'function', 'entity_type should be function');
      assertEqual(entry.entity, 'PromptArea', 'entity should be PromptArea');
      assertIncludes(entry.file, 'PromptArea.tsx', 'file should contain PromptArea.tsx');
      assert(Array.isArray(entry.lines), 'lines is array');
      assertEqual(entry.lines.length, 2, 'lines has 2 elements');
      assertEqual(typeof entry.lines[0], 'number', 'lines[0] is number');
      assertEqual(typeof entry.lines[1], 'number', 'lines[1] is number');
      assert(entry.lines[0] > 0, 'lines[0] > 0');
      assert(entry.lines[1] >= entry.lines[0], 'lines[1] >= lines[0]');
      assert(typeof entry.diff_summary === 'string', 'diff_summary is string');
    } finally {
      cleanup();
    }
  });

  it('AC-3b: should extract entity with entity_type "class" from hunk header containing a class declaration', () => {
    const { repoDir, specPath, branch, cleanup } = createTestRepo({ diffType: 'class' });
    try {
      const result = runScript([
        '--branch', branch,
        '--spec-path', specPath,
        '--repo', 'owner/repo',
      ], { cwd: repoDir });
      assertEqual(result.status, 0, `exit code (stderr: ${result.stderr})`);

      const claims = JSON.parse(fs.readFileSync(path.join(specPath, 'claims.json'), 'utf8'));
      const entry = claims.entities_changed[0];
      assertEqual(entry.entity, 'UserService', 'entity should be UserService');
      assertEqual(entry.entity_type, 'class', 'entity_type should be class');
    } finally {
      cleanup();
    }
  });

  it('AC-3c: should populate lines[] with integer [start, end] tuple from hunk range', () => {
    const { repoDir, specPath, branch, cleanup } = createTestRepo({ diffType: 'class' });
    try {
      const result = runScript([
        '--branch', branch,
        '--spec-path', specPath,
        '--repo', 'owner/repo',
      ], { cwd: repoDir });
      assertEqual(result.status, 0, `exit code (stderr: ${result.stderr})`);

      const claims = JSON.parse(fs.readFileSync(path.join(specPath, 'claims.json'), 'utf8'));
      const entry = claims.entities_changed[0];
      assert(Array.isArray(entry.lines), 'lines is array');
      assertEqual(entry.lines.length, 2, 'lines has 2 elements');
      assert(Number.isInteger(entry.lines[0]), 'lines[0] is integer');
      assert(Number.isInteger(entry.lines[1]), 'lines[1] is integer');
      assert(entry.lines[0] > 0, 'start > 0');
      assert(entry.lines[1] >= entry.lines[0], 'end >= start');
    } finally {
      cleanup();
    }
  });

  // =========================================================================
  // AC-4: GIVEN ein Hunk-Header ohne erkennbares Entity-Pattern
  //       (z.B. @@ -10,5 +10,5 @@ ohne funcname)
  //       WHEN das Script den Diff parst
  //       THEN enthaelt der zugehoerige Eintrag entity: null und
  //            entity_type: "unknown" — das Script terminiert NICHT mit Fehler
  // =========================================================================
  it('AC-4: should produce entity: null and entity_type: "unknown" for hunk header without funcname, without exiting with error', () => {
    const { repoDir, specPath, branch, cleanup } = createTestRepo({ diffType: 'no_funcname' });
    try {
      const result = runScript([
        '--branch', branch,
        '--spec-path', specPath,
        '--repo', 'owner/repo',
      ], { cwd: repoDir });
      assertEqual(result.status, 0, `exit code should be 0 (stderr: ${result.stderr})`);

      const claims = JSON.parse(fs.readFileSync(path.join(specPath, 'claims.json'), 'utf8'));
      assert(claims.entities_changed.length > 0, 'entities_changed is non-empty');

      const entry = claims.entities_changed[0];
      assertEqual(entry.entity, null, 'entity should be null');
      assertEqual(entry.entity_type, 'unknown', 'entity_type should be "unknown"');
    } finally {
      cleanup();
    }
  });

  // =========================================================================
  // AC-5: GIVEN alle Hunks einer Datei sind Additions (+) und die Datei
  //       existiert nicht in main (neue Datei)
  //       WHEN das Script den Diff parst
  //       THEN enthaelt der Eintrag entity: null und entity_type: "new_file"
  //            — summary.new_files wird um 1 erhoeht
  // =========================================================================
  it('AC-5a: should produce entity: null and entity_type: "new_file" for a newly added file', () => {
    const { repoDir, specPath, branch, cleanup } = createTestRepo({ diffType: 'new_file' });
    try {
      const result = runScript([
        '--branch', branch,
        '--spec-path', specPath,
        '--repo', 'owner/repo',
      ], { cwd: repoDir });
      assertEqual(result.status, 0, `exit code (stderr: ${result.stderr})`);

      const claims = JSON.parse(fs.readFileSync(path.join(specPath, 'claims.json'), 'utf8'));
      assert(claims.entities_changed.length > 0, 'entities_changed is non-empty');

      const newFileEntries = claims.entities_changed.filter(e => e.entity_type === 'new_file');
      assert(newFileEntries.length > 0, 'should have at least one new_file entry');
      const entry = newFileEntries[0];
      assertEqual(entry.entity, null, 'entity should be null for new file');
      assertEqual(entry.entity_type, 'new_file', 'entity_type should be "new_file"');
    } finally {
      cleanup();
    }
  });

  it('AC-5b: should increment summary.new_files for each new file detected', () => {
    const { repoDir, specPath, branch, cleanup } = createTestRepo({ diffType: 'two_new_files' });
    try {
      const result = runScript([
        '--branch', branch,
        '--spec-path', specPath,
        '--repo', 'owner/repo',
      ], { cwd: repoDir });
      assertEqual(result.status, 0, `exit code (stderr: ${result.stderr})`);

      const claims = JSON.parse(fs.readFileSync(path.join(specPath, 'claims.json'), 'utf8'));
      assertEqual(claims.summary.new_files, 2, 'summary.new_files should be 2');
    } finally {
      cleanup();
    }
  });

  // =========================================================================
  // AC-6: GIVEN ein valider Lauf ohne Fehler
  //       WHEN claims.json geschrieben wird
  //       THEN ist das JSON valide (parsebar), enthaelt entities_changed (Array),
  //            summary.files_changed (Integer >= 0), summary.entities_changed
  //            (Integer >= 0) und summary.new_files (Integer >= 0)
  // =========================================================================
  it('AC-6: should write parseable JSON to claims.json with all required top-level fields', () => {
    const { repoDir, specPath, branch, cleanup } = createTestRepo({ diffType: 'mixed' });
    try {
      const result = runScript([
        '--branch', branch,
        '--spec-path', specPath,
        '--repo', 'owner/repo',
      ], { cwd: repoDir });
      assertEqual(result.status, 0, `exit code (stderr: ${result.stderr})`);

      const claimsPath = path.join(specPath, 'claims.json');
      assert(fs.existsSync(claimsPath), 'claims.json exists');

      // Must be parseable JSON
      const raw = fs.readFileSync(claimsPath, 'utf8');
      let claims;
      try {
        claims = JSON.parse(raw);
      } catch (e) {
        throw new Error('claims.json is not valid JSON: ' + e.message);
      }

      // entities_changed is Array
      assert(Array.isArray(claims.entities_changed), 'entities_changed is Array');

      // summary exists and has required integer fields >= 0
      assert(claims.summary != null, 'summary exists');
      assert(Number.isInteger(claims.summary.files_changed), 'summary.files_changed is integer');
      assert(claims.summary.files_changed >= 0, 'summary.files_changed >= 0');
      assert(Number.isInteger(claims.summary.entities_changed), 'summary.entities_changed is integer');
      assert(claims.summary.entities_changed >= 0, 'summary.entities_changed >= 0');
      assert(Number.isInteger(claims.summary.new_files), 'summary.new_files is integer');
      assert(claims.summary.new_files >= 0, 'summary.new_files >= 0');

      // Verify each entity entry has required fields per claims.json schema
      for (const entry of claims.entities_changed) {
        assert(typeof entry.file === 'string', 'entity.file is string');
        assert(entry.entity === null || typeof entry.entity === 'string', 'entity.entity is string or null');
        assert(typeof entry.entity_type === 'string', 'entity.entity_type is string');
        assertIncludes(
          ['function', 'class', 'method', 'new_file', 'unknown'],
          entry.entity_type,
          `entity_type "${entry.entity_type}" is valid enum`
        );
        assert(Array.isArray(entry.lines), 'entity.lines is array');
        assertEqual(entry.lines.length, 2, 'entity.lines has 2 elements');
        assert(Number.isInteger(entry.lines[0]), 'lines[0] is integer');
        assert(Number.isInteger(entry.lines[1]), 'lines[1] is integer');
        assert(typeof entry.diff_summary === 'string', 'entity.diff_summary is string');
      }

      // Verify summary counts are consistent
      assertEqual(
        claims.summary.entities_changed,
        claims.entities_changed.length,
        'summary.entities_changed matches array length'
      );
      assert(
        claims.summary.files_changed > 0,
        'summary.files_changed > 0 for mixed diff'
      );
      assert(
        claims.summary.new_files >= 1,
        'summary.new_files >= 1 for mixed diff with new file'
      );
    } finally {
      cleanup();
    }
  });

  // =========================================================================
  // AC-7: GIVEN --weave Flag ist gesetzt UND weave-cli ist im PATH verfuegbar
  //       WHEN das Script weave-cli preview main aufruft
  //       THEN wird der Text-Output geparst und als primaere Entity-Extraktion
  //            genutzt statt git diff — claims.json reflektiert Weave-Analyse
  // =========================================================================
  it('AC-7: should use weave-cli output as primary entity source when --weave flag is set and weave-cli is in PATH', () => {
    const { repoDir, specPath, branch, cleanup: cleanupRepo } = createTestRepo({ diffType: 'function' });
    const { mockBinDir, nodeOptions, cleanup: cleanupWeave } = createWeaveMock({
      weaveOutput: FIXTURE_WEAVE_OUTPUT,
      weaveExitCode: 0,
    });
    try {
      const result = runScript([
        '--branch', branch,
        '--spec-path', specPath,
        '--repo', 'owner/repo',
        '--weave',
      ], { cwd: repoDir, prependPath: mockBinDir, nodeOptions });
      assertEqual(result.status, 0, `exit code (stderr: ${result.stderr})`);

      const claims = JSON.parse(fs.readFileSync(path.join(specPath, 'claims.json'), 'utf8'));
      assert(Array.isArray(claims.entities_changed), 'entities_changed is array');

      // Weave output has "initApp" and "DbPool" — these should be in claims
      const entityNames = claims.entities_changed.map(e => e.entity);
      assertIncludes(entityNames, 'initApp', 'weave entity "initApp" should be present');
      assertIncludes(entityNames, 'DbPool', 'weave entity "DbPool" should be present');

      // Verify weave was used as PRIMARY: PromptArea from git diff should NOT appear
      assert(
        !entityNames.includes('PromptArea'),
        'git diff entity "PromptArea" should NOT be present when weave is primary source'
      );

      // Verify entity types from weave
      const initApp = claims.entities_changed.find(e => e.entity === 'initApp');
      assertEqual(initApp.entity_type, 'function', 'initApp entity_type from weave');
      const dbPool = claims.entities_changed.find(e => e.entity === 'DbPool');
      assertEqual(dbPool.entity_type, 'class', 'DbPool entity_type from weave');
    } finally {
      cleanupWeave();
      cleanupRepo();
    }
  });

  // =========================================================================
  // AC-8: GIVEN --weave Flag ist gesetzt ABER weave-cli ist NICHT im PATH
  //       WHEN das Script weave-cli preview main aufrufen versucht
  //       THEN faellt es auf git diff Hunk-Header-Parsing zurueck — kein
  //            Exit-Code 2, eine Warnung wird auf stderr ausgegeben
  // =========================================================================
  it('AC-8: should fall back to git diff parsing with exit code 0 and a stderr warning when --weave is set but weave-cli is not in PATH', () => {
    const { repoDir, specPath, branch, cleanup } = createTestRepo({ diffType: 'function' });
    try {
      // No weave mock — weave-cli is not available
      const result = runScript([
        '--branch', branch,
        '--spec-path', specPath,
        '--repo', 'owner/repo',
        '--weave',
      ], { cwd: repoDir });

      // Should NOT exit with code 2 — fallback to git diff
      assertEqual(result.status, 0, `exit code should be 0, not 2 (stderr: ${result.stderr})`);

      // Stderr should contain a warning about weave-cli
      assertMatch(
        result.stderr,
        /[Ww]arning.*weave|weave.*not available|falling back/i,
        'stderr should warn about weave-cli fallback'
      );

      // claims.json should exist and contain git diff results
      const claims = JSON.parse(fs.readFileSync(path.join(specPath, 'claims.json'), 'utf8'));
      assert(claims.entities_changed.length > 0, 'entities_changed from git diff fallback');
    } finally {
      cleanup();
    }
  });

});

// ===========================================================================
// Slice 03: GitHub Registry, Overlap & Report
// ===========================================================================

// ---------------------------------------------------------------------------
// Helpers for Slice 03 — gh CLI Mocking via PATH Manipulation
// ---------------------------------------------------------------------------

/**
 * Create a temporary directory with mock `gh` and `gh.cmd` executables.
 *
 * @param {Object} opts
 * @param {number} [opts.authExitCode]   — exit code for `gh auth status` (default 0)
 * @param {string} [opts.authStderr]     — stderr for `gh auth status`
 * @param {string} [opts.createStdout]   — stdout for `gh issue create` (default: URL with issue #42)
 * @param {number} [opts.createExitCode] — exit code for `gh issue create` (default 0)
 * @param {string} [opts.listStdout]     — stdout for `gh issue list` (JSON array)
 * @param {number} [opts.listExitCode]   — exit code for `gh issue list` (default 0)
 * @returns {{ mockBinDir: string, cleanup: () => void }}
 */
function createGhMock(opts = {}) {
  const mockBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-test-gh-'));

  const authExitCode = opts.authExitCode != null ? opts.authExitCode : 0;
  const authStderr = opts.authStderr || '';
  const createStdout = opts.createStdout || 'https://github.com/owner/repo/issues/42';
  const createExitCode = opts.createExitCode != null ? opts.createExitCode : 0;
  const listStdout = opts.listStdout || '[]';
  const listExitCode = opts.listExitCode != null ? opts.listExitCode : 0;

  if (IS_WINDOWS) {
    // On Windows: create gh.cmd (batch file) that dispatches by subcommand
    // We also need a gh.exe approach. The script uses spawnSync('gh', ...) which
    // on Windows without shell:true needs .exe or .cmd on PATH.
    // Using a Node.js script as gh.cmd works because cmd files are resolved by spawnSync.
    //
    // Actually, spawnSync without shell:true does NOT find .cmd files.
    // So we create a gh.exe by copying node.exe, plus a preload script.
    fs.copyFileSync(process.execPath, path.join(mockBinDir, 'gh.exe'));

    const dispatchScript = path.join(mockBinDir, '_gh_preload.js');
    // On Windows, spawnSync('gh', ['auth','status']) results in node.exe (as gh.exe)
    // receiving argv = [gh.exe, <resolved-path-of-'auth'>, 'status'].
    // Node resolves argv[1] to a full path, so we need basename for subcommand detection.
    // argv[2+] keep their original values.
    const dispatchCode = [
      '"use strict";',
      'var _p = require("path");',
      'var _bn = _p.basename(process.argv[0]).replace(/\\.exe$/i, "");',
      'if (_bn === "gh") {',
      '  var sub1 = _p.basename(process.argv[1] || "");',
      '  var sub2 = process.argv[2] || "";',
      '  if (sub1 === "auth" && sub2 === "status") {',
      `    process.stderr.write(${JSON.stringify(authStderr)});`,
      `    process.exit(${authExitCode});`,
      '  } else if (sub1 === "issue" && sub2 === "create") {',
      `    process.stdout.write(${JSON.stringify(createStdout)});`,
      `    process.exit(${createExitCode});`,
      '  } else if (sub1 === "issue" && sub2 === "list") {',
      `    process.stdout.write(${JSON.stringify(listStdout)});`,
      `    process.exit(${listExitCode});`,
      '  } else {',
      '    process.stderr.write("mock gh: unknown command " + sub1 + " " + sub2);',
      '    process.exit(1);',
      '  }',
      '}',
    ].join('\n');
    fs.writeFileSync(dispatchScript, dispatchCode);

    // Store nodeOptions so we can inject the preload script
    // We'll return it and runScript will merge it into NODE_OPTIONS
    return {
      mockBinDir,
      nodeOptions: `--require=${JSON.stringify(dispatchScript)}`,
      cleanup: () => cleanupDir(mockBinDir),
    };
  } else {
    // Unix: shell script
    const script = [
      '#!/bin/sh',
      'if [ "$1" = "auth" ] && [ "$2" = "status" ]; then',
      `  echo "${authStderr}" >&2`,
      `  exit ${authExitCode}`,
      'elif [ "$1" = "issue" ] && [ "$2" = "create" ]; then',
      `  printf '%s' '${createStdout.replace(/'/g, "'\\''")}'`,
      `  exit ${createExitCode}`,
      'elif [ "$1" = "issue" ] && [ "$2" = "list" ]; then',
      `  printf '%s' '${listStdout.replace(/'/g, "'\\''")}'`,
      `  exit ${listExitCode}`,
      'else',
      '  echo "mock gh: unknown command $@" >&2',
      '  exit 1',
      'fi',
    ].join('\n');
    fs.writeFileSync(path.join(mockBinDir, 'gh'), script, { mode: 0o755 });

    return {
      mockBinDir,
      nodeOptions: null,
      cleanup: () => cleanupDir(mockBinDir),
    };
  }
}

/**
 * Run the conflict-scanner script with a mock gh in PATH.
 * Convenience wrapper that combines createTestRepo + createGhMock + runScript.
 *
 * @param {Object} opts
 * @param {Object} opts.ghMockOpts  — options for createGhMock
 * @param {string} [opts.diffType]  — options for createTestRepo (default: 'function')
 * @param {string[]} [opts.extraArgs] — extra CLI args (e.g. ['--weave'])
 * @param {string} [opts.prependPath] — additional PATH prepend (for weave mock etc.)
 * @param {string} [opts.nodeOptions] — additional NODE_OPTIONS (for weave mock on Windows)
 * @returns {{ result: { status: number, stdout: string, stderr: string }, specPath: string, repoDir: string, cleanup: () => void }}
 */
function runWithGhMock(opts) {
  const { repoDir, specPath, branch, cleanup: cleanupRepo } = createTestRepo({
    diffType: opts.diffType || 'function',
  });
  const { mockBinDir, nodeOptions: ghNodeOptions, cleanup: cleanupGh } = createGhMock(
    opts.ghMockOpts || {}
  );

  // Merge PATH: gh mock first, then optional additional path
  let prependPath = mockBinDir;
  if (opts.prependPath) {
    prependPath = mockBinDir + (IS_WINDOWS ? ';' : ':') + opts.prependPath;
  }

  // Merge NODE_OPTIONS
  let nodeOptions = ghNodeOptions || null;
  if (opts.nodeOptions) {
    nodeOptions = (nodeOptions ? nodeOptions + ' ' : '') + opts.nodeOptions;
  }

  const args = [
    '--branch', branch,
    '--spec-path', specPath,
    '--repo', 'owner/repo',
    ...(opts.extraArgs || []),
  ];

  const result = runScript(args, {
    cwd: repoDir,
    prependPath,
    nodeOptions,
  });

  return {
    result,
    specPath,
    repoDir,
    cleanup: () => {
      cleanupGh();
      cleanupRepo();
    },
  };
}

/**
 * Create a mock gh binary that always fails (simulating gh not installed / not authenticated).
 * On Windows this means no gh.exe in a clean PATH; on Unix, a script that exits 1.
 *
 * For AC-1 we need gh to NOT be in PATH at all, or to fail auth.
 * We use a restricted PATH that excludes the real gh.
 *
 * @returns {{ mockBinDir: string, nodeOptions: string|null, restrictedPath: string, cleanup: () => void }}
 */
function createRestrictedPathWithoutGh() {
  const mockBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-test-nogh-'));

  if (IS_WINDOWS) {
    // Create a gh.exe that exits with code 1 (auth failure)
    fs.copyFileSync(process.execPath, path.join(mockBinDir, 'gh.exe'));
    const preloadScript = path.join(mockBinDir, '_nogh_preload.js');
    const preloadCode = [
      '"use strict";',
      'var _p = require("path");',
      'var _bn = _p.basename(process.argv[0]).replace(/\\.exe$/i, "");',
      'if (_bn === "gh") {',
      '  var sub1 = _p.basename(process.argv[1] || "");',
      '  if (sub1 === "auth") {',
      '    process.stderr.write("not authenticated");',
      '    process.exit(1);',
      '  }',
      '  process.stderr.write("not authenticated");',
      '  process.exit(1);',
      '}',
    ].join('\n');
    fs.writeFileSync(preloadScript, preloadCode);

    return {
      mockBinDir,
      nodeOptions: `--require=${JSON.stringify(preloadScript)}`,
      cleanup: () => cleanupDir(mockBinDir),
    };
  } else {
    // Unix: gh script that always fails auth
    const script = '#!/bin/sh\necho "not authenticated" >&2\nexit 1\n';
    fs.writeFileSync(path.join(mockBinDir, 'gh'), script, { mode: 0o755 });

    return {
      mockBinDir,
      nodeOptions: null,
      cleanup: () => cleanupDir(mockBinDir),
    };
  }
}

// ---------------------------------------------------------------------------
// Slice 03 Tests
// ---------------------------------------------------------------------------

describe('Session Registry', () => {

  // =========================================================================
  // AC-1: GIVEN gh CLI ist nicht im PATH oder gh auth status schlaegt fehl
  //       WHEN das Script nach dem Claims-Schreiben gh issue create aufrufen will
  //       THEN terminiert das Script mit Exit-Code 2 und schreibt
  //            "GitHub CLI not authenticated" auf stderr —
  //            overlap-report.json wird NICHT geschrieben
  // =========================================================================
  it('AC-1: should exit with code 2 and stderr "GitHub CLI not authenticated" when gh is not in PATH', () => {
    const { repoDir, specPath, branch, cleanup: cleanupRepo } = createTestRepo({ diffType: 'function' });
    const { mockBinDir, nodeOptions, cleanup: cleanupMock } = createRestrictedPathWithoutGh();
    try {
      const result = runScript([
        '--branch', branch,
        '--spec-path', specPath,
        '--repo', 'owner/repo',
      ], {
        cwd: repoDir,
        prependPath: mockBinDir,
        nodeOptions,
      });

      assertEqual(result.status, 2, 'exit code should be 2');
      assertIncludes(result.stderr, 'GitHub CLI not authenticated', 'stderr should contain auth error message');

      // overlap-report.json must NOT be written
      const reportPath = path.join(specPath, 'overlap-report.json');
      assert(!fs.existsSync(reportPath), 'overlap-report.json should NOT be written when gh auth fails');
    } finally {
      cleanupMock();
      cleanupRepo();
    }
  });

  // =========================================================================
  // AC-2: GIVEN ein valides claims.json wurde von Slice 2 geschrieben und gh
  //       ist authentifiziert
  //       WHEN das Script gh issue create aufruft
  //       THEN wird ein GitHub Issue mit Titel "Pipeline: {feature}",
  //            Label "pipeline:running" und einem Body erstellt der zwei
  //            JSON-Bloecke enthaelt (## Session und ## Entity Claims)
  // =========================================================================
  it('AC-2: should call gh issue create with title "Pipeline: {feature}", label "pipeline:running" and a body containing ## Session and ## Entity Claims JSON blocks', () => {
    // We need to capture what arguments gh issue create was called with.
    // Strategy: create a mock gh that writes its arguments to a log file, then verify.
    const { repoDir, specPath, branch, cleanup: cleanupRepo } = createTestRepo({ diffType: 'function' });
    const ghLogFile = path.join(os.tmpdir(), 'cs-test-gh-log-' + Date.now() + '.json');
    const mockBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-test-gh-log-'));

    try {
      if (IS_WINDOWS) {
        fs.copyFileSync(process.execPath, path.join(mockBinDir, 'gh.exe'));
        const preloadScript = path.join(mockBinDir, '_gh_log_preload.js');
        const preloadCode = [
          '"use strict";',
          'var _p = require("path");',
          'var _fs = require("fs");',
          'var _bn = _p.basename(process.argv[0]).replace(/\\.exe$/i, "");',
          'if (_bn === "gh") {',
          '  var sub1 = _p.basename(process.argv[1] || "");',
          '  var sub2 = process.argv[2] || "";',
          '  var restArgs = process.argv.slice(3);',
          '  if (sub1 === "auth" && sub2 === "status") {',
          '    process.exit(0);',
          '  } else if (sub1 === "issue" && sub2 === "create") {',
          '    // Log all arguments to file for inspection',
          `    _fs.writeFileSync(${JSON.stringify(ghLogFile)}, JSON.stringify([sub1, sub2].concat(restArgs)));`,
          '    process.stdout.write("https://github.com/owner/repo/issues/42");',
          '    process.exit(0);',
          '  } else if (sub1 === "issue" && sub2 === "list") {',
          '    process.stdout.write("[]");',
          '    process.exit(0);',
          '  } else {',
          '    process.exit(1);',
          '  }',
          '}',
        ].join('\n');
        fs.writeFileSync(preloadScript, preloadCode);

        const result = runScript([
          '--branch', branch,
          '--spec-path', specPath,
          '--repo', 'owner/repo',
        ], {
          cwd: repoDir,
          prependPath: mockBinDir,
          nodeOptions: `--require=${JSON.stringify(preloadScript)}`,
        });

        // The script should complete (exit 0 = no overlaps since list returns [])
        assert(result.status === 0 || result.status === 1,
          `exit code should be 0 or 1, got ${result.status} (stderr: ${result.stderr})`);

        // Read the logged gh args
        assert(fs.existsSync(ghLogFile), 'gh log file should exist — gh issue create was called');
        const ghArgs = JSON.parse(fs.readFileSync(ghLogFile, 'utf8'));

        // Verify title
        const titleIdx = ghArgs.indexOf('--title');
        assert(titleIdx >= 0, 'gh args should contain --title');
        const titleValue = ghArgs[titleIdx + 1];
        assertMatch(titleValue, /^Pipeline: /, 'title should start with "Pipeline: "');

        // Verify label
        const labelIdx = ghArgs.indexOf('--label');
        assert(labelIdx >= 0, 'gh args should contain --label');
        assertEqual(ghArgs[labelIdx + 1], 'pipeline:running', 'label should be "pipeline:running"');

        // Verify body contains ## Session and ## Entity Claims with JSON blocks
        const bodyIdx = ghArgs.indexOf('--body');
        assert(bodyIdx >= 0, 'gh args should contain --body');
        const bodyValue = ghArgs[bodyIdx + 1];
        assertIncludes(bodyValue, '## Session', 'body should contain ## Session');
        assertIncludes(bodyValue, '## Entity Claims', 'body should contain ## Entity Claims');
        assertIncludes(bodyValue, '```json', 'body should contain JSON code blocks');

        // Verify the Session JSON block is valid
        const sessionMatch = bodyValue.match(/## Session[\s\S]*?```json\s*([\s\S]*?)```/);
        assert(sessionMatch, 'body should have a Session JSON block');
        const sessionData = JSON.parse(sessionMatch[1]);
        assert(typeof sessionData.session_id === 'string', 'session_id should be string');
        assert(typeof sessionData.feature === 'string', 'feature should be string');
        assert(typeof sessionData.branch === 'string', 'branch should be string');

        // Verify the Entity Claims JSON block is valid
        const claimsMatch = bodyValue.match(/## Entity Claims[\s\S]*?```json\s*([\s\S]*?)```/);
        assert(claimsMatch, 'body should have an Entity Claims JSON block');
        const claimsData = JSON.parse(claimsMatch[1]);
        assert(Array.isArray(claimsData.entities_changed), 'Entity Claims should have entities_changed array');
        assert(claimsData.summary != null, 'Entity Claims should have summary');
      } else {
        // Unix version: shell script that logs args
        const script = [
          '#!/bin/sh',
          'if [ "$1" = "auth" ] && [ "$2" = "status" ]; then',
          '  exit 0',
          'elif [ "$1" = "issue" ] && [ "$2" = "create" ]; then',
          `  echo "$@" > "${ghLogFile}"`,
          // Also capture --body content by finding it in the args
          '  # Extract body argument for detailed inspection',
          '  body=""',
          '  capture_next=false',
          '  for arg in "$@"; do',
          '    if [ "$capture_next" = "true" ]; then',
          '      body="$arg"',
          '      capture_next=false',
          '    fi',
          '    if [ "$arg" = "--body" ]; then',
          '      capture_next=true',
          '    fi',
          '  done',
          `  printf '%s' "$body" > "${ghLogFile}.body"`,
          '  echo "https://github.com/owner/repo/issues/42"',
          '  exit 0',
          'elif [ "$1" = "issue" ] && [ "$2" = "list" ]; then',
          '  echo "[]"',
          '  exit 0',
          'fi',
          'exit 1',
        ].join('\n');
        fs.writeFileSync(path.join(mockBinDir, 'gh'), script, { mode: 0o755 });

        const result = runScript([
          '--branch', branch,
          '--spec-path', specPath,
          '--repo', 'owner/repo',
        ], {
          cwd: repoDir,
          prependPath: mockBinDir,
        });

        assert(result.status === 0 || result.status === 1,
          `exit code should be 0 or 1, got ${result.status} (stderr: ${result.stderr})`);

        // Read logged args
        assert(fs.existsSync(ghLogFile), 'gh log file should exist');
        const logContent = fs.readFileSync(ghLogFile, 'utf8');
        assertIncludes(logContent, '--title', 'logged args should contain --title');
        assertIncludes(logContent, 'Pipeline:', 'logged args should contain Pipeline: prefix');
        assertIncludes(logContent, '--label', 'logged args should contain --label');
        assertIncludes(logContent, 'pipeline:running', 'logged args should contain pipeline:running label');

        // Read and validate body
        const bodyFile = ghLogFile + '.body';
        assert(fs.existsSync(bodyFile), 'body log file should exist');
        const bodyValue = fs.readFileSync(bodyFile, 'utf8');
        assertIncludes(bodyValue, '## Session', 'body should contain ## Session');
        assertIncludes(bodyValue, '## Entity Claims', 'body should contain ## Entity Claims');
      }
    } finally {
      cleanupDir(mockBinDir);
      try { fs.unlinkSync(ghLogFile); } catch (_) {}
      try { fs.unlinkSync(ghLogFile + '.body'); } catch (_) {}
      cleanupRepo();
    }
  });

  // =========================================================================
  // AC-3: GIVEN gh issue list --label pipeline:running gibt N Issues zurueck
  //       WHEN das Script die Issue-Bodies parst
  //       THEN werden valide JSON-Bloecke aus ## Entity Claims als andere
  //            Sessions erfasst — Issues mit ungueltigem JSON werden mit
  //            einer stderr-Warnung "Skipping issue #{n}: invalid JSON"
  //            uebersprungen, das Script terminiert NICHT mit Fehler
  // =========================================================================
  it('AC-3a: should parse entity claims from valid issue bodies and add them as other sessions', () => {
    const validIssueBody = [
      '## Session',
      '',
      '```json',
      JSON.stringify({
        session_id: 'other-session-uuid',
        feature: 'other-feature',
        branch: 'feature/other',
        spec_path: '/tmp/other-spec',
        started_at: '2026-03-09T00:00:00.000Z',
      }, null, 2),
      '```',
      '',
      '## Entity Claims',
      '',
      '```json',
      JSON.stringify({
        entities_changed: [
          { file: 'src/components/PromptArea.tsx', entity: 'PromptArea', entity_type: 'function', lines: [42, 56], diff_summary: '+5 -0' },
        ],
        summary: { files_changed: 1, entities_changed: 1, new_files: 0 },
      }, null, 2),
      '```',
    ].join('\n');

    const listOutput = JSON.stringify([
      { number: 10, title: 'Pipeline: other-feature', body: validIssueBody },
    ]);

    const { result, specPath, cleanup } = runWithGhMock({
      diffType: 'function',
      ghMockOpts: {
        listStdout: listOutput,
      },
    });

    try {
      // Script should find overlaps (both modify PromptArea in same file) → exit 1
      // OR exit 0 if it excludes own issue. Either way, NOT exit 2.
      assert(result.status !== 2, `should not exit with code 2 (stderr: ${result.stderr})`);

      // overlap-report.json should exist
      const reportPath = path.join(specPath, 'overlap-report.json');
      assert(fs.existsSync(reportPath), 'overlap-report.json should be written');

      const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      // Since both sessions modify PromptArea in the same file, overlaps should be found
      assert(Array.isArray(report.overlaps), 'overlaps should be array');
      assert(report.overlaps.length > 0, 'overlaps should have entries (same entity in same file)');

      // Verify the overlap references the other session
      const overlap = report.overlaps[0];
      assertEqual(overlap.their_issue, 10, 'their_issue should be 10');
      assertEqual(overlap.their_feature, 'other-feature', 'their_feature should be other-feature');
    } finally {
      cleanup();
    }
  });

  it('AC-3b: should skip issues with invalid JSON body and write stderr warning "Skipping issue #N: invalid JSON" without exiting', () => {
    const invalidIssueBody = [
      '## Session',
      '',
      '```json',
      '{ this is not valid json',
      '```',
      '',
      '## Entity Claims',
      '',
      '```json',
      '{ also not valid json !!!',
      '```',
    ].join('\n');

    const listOutput = JSON.stringify([
      { number: 77, title: 'Pipeline: broken-feature', body: invalidIssueBody },
    ]);

    const { result, specPath, cleanup } = runWithGhMock({
      diffType: 'function',
      ghMockOpts: {
        listStdout: listOutput,
      },
    });

    try {
      // Script should NOT terminate with error — exit 0 (no valid overlaps)
      assert(result.status !== 2, `should not exit with code 2 (stderr: ${result.stderr})`);
      assertEqual(result.status, 0, 'should exit with code 0 (invalid issue skipped, no overlaps)');

      // Stderr should contain the skip warning with issue number
      assertIncludes(result.stderr, 'Skipping issue #77', 'stderr should contain "Skipping issue #77"');
      assertIncludes(result.stderr, 'invalid JSON', 'stderr should contain "invalid JSON"');

      // overlap-report.json should still be written (with no overlaps)
      const reportPath = path.join(specPath, 'overlap-report.json');
      assert(fs.existsSync(reportPath), 'overlap-report.json should be written even when issues are skipped');
    } finally {
      cleanup();
    }
  });

});

describe('Overlap Calculator', () => {

  // =========================================================================
  // AC-4: GIVEN zwei Sessions haben jeweils entity: "PromptArea" in
  //       file: "components/prompt-area.tsx"
  //       WHEN der Overlap Calculator laeuft
  //       THEN enthaelt overlaps[] einen Eintrag mit
  //            overlap_type: "same_entity" und severity: "high"
  // =========================================================================
  it('AC-4: should produce overlap_type "same_entity" and severity "high" for two sessions sharing the same file and entity name', () => {
    // Other session also claims PromptArea in same file
    const otherIssueBody = [
      '## Session',
      '',
      '```json',
      JSON.stringify({
        session_id: 'other-uuid',
        feature: 'other-feature',
        branch: 'feature/other',
        spec_path: '/tmp/other',
        started_at: '2026-03-09T00:00:00.000Z',
      }, null, 2),
      '```',
      '',
      '## Entity Claims',
      '',
      '```json',
      JSON.stringify({
        entities_changed: [
          {
            file: 'src/components/PromptArea.tsx',
            entity: 'PromptArea',
            entity_type: 'function',
            lines: [42, 56],
            diff_summary: '+3 -1',
          },
        ],
        summary: { files_changed: 1, entities_changed: 1, new_files: 0 },
      }, null, 2),
      '```',
    ].join('\n');

    const listOutput = JSON.stringify([
      { number: 20, title: 'Pipeline: other-feature', body: otherIssueBody },
    ]);

    const { result, specPath, cleanup } = runWithGhMock({
      diffType: 'function',   // Our session also modifies PromptArea in PromptArea.tsx
      ghMockOpts: {
        listStdout: listOutput,
      },
    });

    try {
      // Should find overlaps → exit 1
      assertEqual(result.status, 1, `exit code should be 1 (overlaps found) (stderr: ${result.stderr})`);

      const report = JSON.parse(
        fs.readFileSync(path.join(specPath, 'overlap-report.json'), 'utf8')
      );
      assert(report.overlaps.length > 0, 'overlaps should have at least 1 entry');

      // Find the same_entity overlap
      const sameEntityOverlap = report.overlaps.find(
        (o) => o.overlap_type === 'same_entity'
      );
      assert(sameEntityOverlap, 'should have an overlap with overlap_type "same_entity"');
      assertEqual(sameEntityOverlap.severity, 'high', 'same_entity overlap should have severity "high"');
      assertEqual(sameEntityOverlap.our_entity, 'PromptArea', 'our_entity should be PromptArea');
      assertEqual(sameEntityOverlap.their_entity, 'PromptArea', 'their_entity should be PromptArea');
      assertIncludes(sameEntityOverlap.file, 'PromptArea.tsx', 'file should contain PromptArea.tsx');
    } finally {
      cleanup();
    }
  });

  // =========================================================================
  // AC-5: GIVEN zwei Sessions haben unterschiedliche Entities
  //       (entity: "PromptArea" vs entity: "usePromptState") in derselben file
  //       WHEN der Overlap Calculator laeuft
  //       THEN enthaelt overlaps[] einen Eintrag mit
  //            overlap_type: "same_file_different_entity" und severity: "low"
  // =========================================================================
  it('AC-5: should produce overlap_type "same_file_different_entity" and severity "low" for two sessions sharing a file but different entity names', () => {
    // Other session claims a DIFFERENT entity in the same file
    const otherIssueBody = [
      '## Session',
      '',
      '```json',
      JSON.stringify({
        session_id: 'other-uuid-2',
        feature: 'other-feature-2',
        branch: 'feature/other-2',
        spec_path: '/tmp/other-2',
        started_at: '2026-03-09T00:00:00.000Z',
      }, null, 2),
      '```',
      '',
      '## Entity Claims',
      '',
      '```json',
      JSON.stringify({
        entities_changed: [
          {
            file: 'src/components/PromptArea.tsx',
            entity: 'usePromptState',
            entity_type: 'function',
            lines: [10, 25],
            diff_summary: '+2 -1',
          },
        ],
        summary: { files_changed: 1, entities_changed: 1, new_files: 0 },
      }, null, 2),
      '```',
    ].join('\n');

    const listOutput = JSON.stringify([
      { number: 30, title: 'Pipeline: other-feature-2', body: otherIssueBody },
    ]);

    const { result, specPath, cleanup } = runWithGhMock({
      diffType: 'function',   // Our session modifies PromptArea in PromptArea.tsx
      ghMockOpts: {
        listStdout: listOutput,
      },
    });

    try {
      assertEqual(result.status, 1, `exit code should be 1 (overlaps found) (stderr: ${result.stderr})`);

      const report = JSON.parse(
        fs.readFileSync(path.join(specPath, 'overlap-report.json'), 'utf8')
      );
      assert(report.overlaps.length > 0, 'overlaps should have at least 1 entry');

      // Find the same_file_different_entity overlap
      const diffEntityOverlap = report.overlaps.find(
        (o) => o.overlap_type === 'same_file_different_entity'
      );
      assert(diffEntityOverlap, 'should have an overlap with overlap_type "same_file_different_entity"');
      assertEqual(diffEntityOverlap.severity, 'low', 'same_file_different_entity should have severity "low"');
      assertEqual(diffEntityOverlap.our_entity, 'PromptArea', 'our_entity should be PromptArea');
      assertEqual(diffEntityOverlap.their_entity, 'usePromptState', 'their_entity should be usePromptState');
    } finally {
      cleanup();
    }
  });

});

describe('Report Writer', () => {

  // =========================================================================
  // AC-6: GIVEN der Overlap Calculator hat Overlaps berechnet (mind. 1
  //       Eintrag mit severity: "high")
  //       WHEN der Report Writer overlap-report.json schreibt
  //       THEN ist das JSON valide, enthaelt alle Pflichtfelder
  //            (session_id, feature, branch, scan_timestamp, entities_changed[],
  //            overlaps[], weave_validation, summary)
  //            mit summary.max_severity: "high"
  // =========================================================================
  it('AC-6: should write parseable overlap-report.json with all required fields and summary.max_severity "high" when high-severity overlaps exist', () => {
    // Create a scenario with same_entity overlap → high severity
    const otherIssueBody = [
      '## Session',
      '',
      '```json',
      JSON.stringify({
        session_id: 'other-uuid-3',
        feature: 'other-feature-3',
        branch: 'feature/other-3',
        spec_path: '/tmp/other-3',
        started_at: '2026-03-09T00:00:00.000Z',
      }, null, 2),
      '```',
      '',
      '## Entity Claims',
      '',
      '```json',
      JSON.stringify({
        entities_changed: [
          {
            file: 'src/components/PromptArea.tsx',
            entity: 'PromptArea',
            entity_type: 'function',
            lines: [42, 56],
            diff_summary: '+4 -2',
          },
        ],
        summary: { files_changed: 1, entities_changed: 1, new_files: 0 },
      }, null, 2),
      '```',
    ].join('\n');

    const listOutput = JSON.stringify([
      { number: 40, title: 'Pipeline: other-feature-3', body: otherIssueBody },
    ]);

    const { result, specPath, cleanup } = runWithGhMock({
      diffType: 'function',
      ghMockOpts: {
        listStdout: listOutput,
      },
    });

    try {
      assert(result.status !== 2, `should not exit with code 2 (stderr: ${result.stderr})`);

      const reportPath = path.join(specPath, 'overlap-report.json');
      assert(fs.existsSync(reportPath), 'overlap-report.json should exist');

      const raw = fs.readFileSync(reportPath, 'utf8');
      let report;
      try {
        report = JSON.parse(raw);
      } catch (e) {
        throw new Error('overlap-report.json is not valid JSON: ' + e.message);
      }

      // Verify all required top-level fields per architecture.md schema
      assert(typeof report.session_id === 'string', 'session_id should be string');
      assert(report.session_id.length > 0, 'session_id should be non-empty');
      // UUID v4 format check
      assertMatch(
        report.session_id,
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        'session_id should be UUID v4'
      );

      assert(typeof report.feature === 'string', 'feature should be string');
      assert(report.feature.length > 0, 'feature should be non-empty');

      assert(typeof report.branch === 'string', 'branch should be string');
      assert(report.branch.length > 0, 'branch should be non-empty');

      assert(typeof report.scan_timestamp === 'string', 'scan_timestamp should be string');
      // ISO 8601 check
      assertMatch(
        report.scan_timestamp,
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
        'scan_timestamp should be ISO 8601'
      );

      assert(Array.isArray(report.entities_changed), 'entities_changed should be array');

      assert(Array.isArray(report.overlaps), 'overlaps should be array');
      assert(report.overlaps.length > 0, 'overlaps should have entries');

      // weave_validation should be present (null since --weave not set)
      assert('weave_validation' in report, 'weave_validation field should exist');

      // summary with all required fields
      assert(report.summary != null, 'summary should exist');
      assert(Number.isInteger(report.summary.files_changed), 'summary.files_changed should be integer');
      assert(Number.isInteger(report.summary.entities_changed), 'summary.entities_changed should be integer');
      assert(Number.isInteger(report.summary.new_files), 'summary.new_files should be integer');
      assert(Number.isInteger(report.summary.overlapping_files), 'summary.overlapping_files should be integer');
      assert(Number.isInteger(report.summary.overlapping_entities), 'summary.overlapping_entities should be integer');
      assert(typeof report.summary.max_severity === 'string', 'summary.max_severity should be string');

      // AC-6 specifically: max_severity must be "high" when high-severity overlaps exist
      assertEqual(report.summary.max_severity, 'high', 'summary.max_severity should be "high"');

      // Verify overlap entries have required fields
      for (const o of report.overlaps) {
        assert(typeof o.file === 'string', 'overlap.file should be string');
        assert('our_entity' in o, 'overlap should have our_entity');
        assert('their_entity' in o, 'overlap should have their_entity');
        assert(typeof o.their_issue === 'number', 'overlap.their_issue should be number');
        assert(typeof o.their_feature === 'string', 'overlap.their_feature should be string');
        assert(typeof o.their_user === 'string', 'overlap.their_user should be string');
        assertIncludes(
          ['same_entity', 'same_file_different_entity'],
          o.overlap_type,
          `overlap_type "${o.overlap_type}" should be valid enum`
        );
        assertIncludes(
          ['low', 'high'],
          o.severity,
          `severity "${o.severity}" should be valid enum`
        );
      }
    } finally {
      cleanup();
    }
  });

  // =========================================================================
  // AC-9: GIVEN --weave Flag ist gesetzt und weave-cli preview main
  //       Output war verfuegbar
  //       WHEN der Report Writer laeuft
  //       THEN ist weave_validation ein Objekt mit auto_resolvable (Boolean),
  //            conflict_entities (Array) und confidence ("high"/"medium"/"low")
  //            — wenn Weave nicht verfuegbar war: weave_validation: null
  // =========================================================================
  it('AC-9a: should set weave_validation to an object with auto_resolvable, conflict_entities and confidence when --weave output was available', () => {
    const { repoDir, specPath, branch, cleanup: cleanupRepo } = createTestRepo({ diffType: 'function' });
    const { mockBinDir: weaveMockDir, nodeOptions: weaveNodeOptions, cleanup: cleanupWeave } = createWeaveMock({
      weaveOutput: FIXTURE_WEAVE_OUTPUT,
      weaveExitCode: 0,
    });
    const { mockBinDir: ghMockDir, nodeOptions: ghNodeOptions, cleanup: cleanupGh } = createGhMock({
      listStdout: '[]',
    });

    try {
      // Combine both mock directories in PATH
      const combinedPath = ghMockDir + (IS_WINDOWS ? ';' : ':') + weaveMockDir;
      // Combine NODE_OPTIONS
      let combinedNodeOptions = '';
      if (ghNodeOptions) combinedNodeOptions += ghNodeOptions;
      if (weaveNodeOptions) combinedNodeOptions += (combinedNodeOptions ? ' ' : '') + weaveNodeOptions;

      const result = runScript([
        '--branch', branch,
        '--spec-path', specPath,
        '--repo', 'owner/repo',
        '--weave',
      ], {
        cwd: repoDir,
        prependPath: combinedPath,
        nodeOptions: combinedNodeOptions || undefined,
      });

      assert(result.status !== 2, `should not exit with code 2 (stderr: ${result.stderr})`);

      const reportPath = path.join(specPath, 'overlap-report.json');
      assert(fs.existsSync(reportPath), 'overlap-report.json should exist');

      const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

      // weave_validation should be an object (not null) since weave was available
      assert(report.weave_validation !== null, 'weave_validation should not be null when --weave output is available');
      assert(typeof report.weave_validation === 'object', 'weave_validation should be an object');
      assert(typeof report.weave_validation.auto_resolvable === 'boolean', 'auto_resolvable should be boolean');
      assert(Array.isArray(report.weave_validation.conflict_entities), 'conflict_entities should be array');
      assertIncludes(
        ['high', 'medium', 'low'],
        report.weave_validation.confidence,
        `confidence "${report.weave_validation.confidence}" should be "high", "medium", or "low"`
      );
    } finally {
      cleanupGh();
      cleanupWeave();
      cleanupRepo();
    }
  });

  it('AC-9b: should set weave_validation to null when weave-cli was not available', () => {
    // Run with --weave but WITHOUT weave-cli in PATH (only gh mock)
    const { result, specPath, cleanup } = runWithGhMock({
      diffType: 'function',
      ghMockOpts: {
        listStdout: '[]',
      },
      extraArgs: ['--weave'],
    });

    try {
      assert(result.status !== 2, `should not exit with code 2 (stderr: ${result.stderr})`);

      const reportPath = path.join(specPath, 'overlap-report.json');
      assert(fs.existsSync(reportPath), 'overlap-report.json should exist');

      const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      assertEqual(report.weave_validation, null, 'weave_validation should be null when weave-cli is not available');
    } finally {
      cleanup();
    }
  });

});

describe('Exit Handler', () => {

  // =========================================================================
  // AC-7: GIVEN overlap-report.json wurde erfolgreich geschrieben und
  //       overlaps[] ist leer
  //       WHEN der Exit Handler laeuft
  //       THEN terminiert das Script mit Exit-Code 0 und schreibt eine
  //            JSON-Zusammenfassung auf stdout
  // =========================================================================
  it('AC-7: should exit with code 0 and write JSON summary to stdout when overlaps[] is empty', () => {
    // No other sessions → no overlaps
    const { result, specPath, cleanup } = runWithGhMock({
      diffType: 'function',
      ghMockOpts: {
        listStdout: '[]',  // No other issues
      },
    });

    try {
      assertEqual(result.status, 0, `exit code should be 0 (no overlaps) (stderr: ${result.stderr})`);

      // Verify overlap-report.json was written with empty overlaps
      const reportPath = path.join(specPath, 'overlap-report.json');
      assert(fs.existsSync(reportPath), 'overlap-report.json should exist');
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      assertEqual(report.overlaps.length, 0, 'overlaps should be empty');

      // Verify JSON summary on stdout
      assert(result.stdout.trim().length > 0, 'stdout should not be empty');
      let stdoutJson;
      try {
        stdoutJson = JSON.parse(result.stdout);
      } catch (e) {
        throw new Error('stdout should be valid JSON: ' + e.message + ' (stdout: ' + result.stdout + ')');
      }
      assertEqual(stdoutJson.status, 'no_overlaps', 'stdout JSON status should be "no_overlaps"');
      assert(typeof stdoutJson.overlap_report_path === 'string', 'stdout JSON should have overlap_report_path');
      assert(typeof stdoutJson.own_issue_number === 'number', 'stdout JSON should have own_issue_number');
      assert(stdoutJson.summary != null, 'stdout JSON should have summary');
    } finally {
      cleanup();
    }
  });

  // =========================================================================
  // AC-8: GIVEN overlap-report.json wurde erfolgreich geschrieben und
  //       overlaps[] enthaelt mind. 1 Eintrag
  //       WHEN der Exit Handler laeuft
  //       THEN terminiert das Script mit Exit-Code 1 und schreibt eine
  //            JSON-Zusammenfassung auf stdout
  // =========================================================================
  it('AC-8: should exit with code 1 and write JSON summary to stdout when overlaps[] has at least one entry', () => {
    // Create an other session that overlaps with our changes
    const otherIssueBody = [
      '## Session',
      '',
      '```json',
      JSON.stringify({
        session_id: 'exit-test-uuid',
        feature: 'exit-test-feature',
        branch: 'feature/exit-test',
        spec_path: '/tmp/exit-test',
        started_at: '2026-03-09T00:00:00.000Z',
      }, null, 2),
      '```',
      '',
      '## Entity Claims',
      '',
      '```json',
      JSON.stringify({
        entities_changed: [
          {
            file: 'src/components/PromptArea.tsx',
            entity: 'PromptArea',
            entity_type: 'function',
            lines: [42, 56],
            diff_summary: '+2 -1',
          },
        ],
        summary: { files_changed: 1, entities_changed: 1, new_files: 0 },
      }, null, 2),
      '```',
    ].join('\n');

    const listOutput = JSON.stringify([
      { number: 50, title: 'Pipeline: exit-test-feature', body: otherIssueBody },
    ]);

    const { result, specPath, cleanup } = runWithGhMock({
      diffType: 'function',
      ghMockOpts: {
        listStdout: listOutput,
      },
    });

    try {
      assertEqual(result.status, 1, `exit code should be 1 (overlaps found) (stderr: ${result.stderr})`);

      // Verify overlap-report.json has overlaps
      const report = JSON.parse(
        fs.readFileSync(path.join(specPath, 'overlap-report.json'), 'utf8')
      );
      assert(report.overlaps.length > 0, 'overlaps should have at least 1 entry');

      // Verify JSON summary on stdout
      assert(result.stdout.trim().length > 0, 'stdout should not be empty');
      let stdoutJson;
      try {
        stdoutJson = JSON.parse(result.stdout);
      } catch (e) {
        throw new Error('stdout should be valid JSON: ' + e.message + ' (stdout: ' + result.stdout + ')');
      }
      assertEqual(stdoutJson.status, 'overlaps_found', 'stdout JSON status should be "overlaps_found"');
      assert(typeof stdoutJson.overlap_report_path === 'string', 'stdout JSON should have overlap_report_path');
      assert(typeof stdoutJson.own_issue_number === 'number', 'stdout JSON should have own_issue_number');
      assert(stdoutJson.summary != null, 'stdout JSON should have summary');
    } finally {
      cleanup();
    }
  });

});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n  ─────────────────────────────────────────`);
console.log(`  Results: ${passedTests} passed, ${failedTests} failed, ${totalTests} total`);
if (failures.length > 0) {
  console.log(`\n  Failures:`);
  for (const f of failures) {
    console.log(`    - ${f.name}`);
    console.log(`      ${f.msg}`);
  }
}
console.log('');

process.exit(failedTests > 0 ? 1 : 0);
