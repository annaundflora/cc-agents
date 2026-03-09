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
