/**
 * Tests for Slice 07: Script-Verzeichnis Plugin-Registration
 *
 * Stack: node-script-no-framework
 * Run:   node plugins/clemens/.claude-plugin/plugin.json.test.js
 *
 * Each test maps 1:1 to an Acceptance Criterion from the slice spec.
 * No mocks -- direct file-system verification with Node.js built-ins.
 */

const fs = require('fs');
const path = require('path');

const PLUGIN_JSON_PATH = path.resolve(__dirname, 'plugin.json');
const PLUGIN_ROOT = path.resolve(__dirname, '..');

let exitCode = 0;
let passed = 0;
let failed = 0;

function test(acId, description, fn) {
  try {
    fn();
    console.log(`PASS  ${acId}: ${description}`);
    passed++;
  } catch (err) {
    console.error(`FAIL  ${acId}: ${description}`);
    console.error(`      ${err.message}`);
    failed++;
    exitCode = 1;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Read the raw file content once -- all tests operate on this
// ---------------------------------------------------------------------------
const rawContent = fs.readFileSync(PLUGIN_JSON_PATH, 'utf-8');

// ---------------------------------------------------------------------------
// AC-2: Valid JSON (run this first so other tests can rely on parsed data)
// ---------------------------------------------------------------------------
let parsed;

test(
  'AC-2',
  'GIVEN the updated plugin.json WHEN JSON.parse() is applied THEN it throws no exception -- the file is valid JSON',
  () => {
    parsed = JSON.parse(rawContent);
    assert(typeof parsed === 'object' && parsed !== null, 'Parsed result is not an object');
  }
);

// If parsing failed, the remaining tests cannot run meaningfully
if (!parsed) {
  console.error('\nAborting remaining tests -- plugin.json is not valid JSON.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// AC-1: Existing keys unchanged
// ---------------------------------------------------------------------------
test(
  'AC-1',
  'GIVEN plugin.json contains keys name, description, version, author WHEN the scripts key is added THEN all four existing keys remain with their exact values',
  () => {
    // Expected values taken from the current plugin.json content
    const expectedName = 'clemens';
    const expectedDescription =
      "Clemens' Agent-Toolkit: Multi-Agent System mit Fresh Context Pattern, Quality Gates (0-3), und vollständigem Feature-Development-Workflow von Discovery bis Deployment.";
    const expectedVersion = '1.1.0';
    const expectedAuthor = { name: 'Clemens', email: 'claude-clemens@zipmend.com' };

    assert(parsed.hasOwnProperty('name'), 'Missing key: name');
    assert(parsed.hasOwnProperty('description'), 'Missing key: description');
    assert(parsed.hasOwnProperty('version'), 'Missing key: version');
    assert(parsed.hasOwnProperty('author'), 'Missing key: author');

    assertEqual(parsed.name, expectedName, 'name');
    assertEqual(parsed.description, expectedDescription, 'description');
    assertEqual(parsed.version, expectedVersion, 'version');
    assertEqual(parsed.author, expectedAuthor, 'author');
  }
);

// ---------------------------------------------------------------------------
// AC-3: scripts key with entry for scripts/conflict-scanner.js
// ---------------------------------------------------------------------------
test(
  'AC-3',
  'GIVEN the updated plugin.json WHEN the scripts key is read THEN it contains at least one entry with path scripts/conflict-scanner.js',
  () => {
    assert(parsed.hasOwnProperty('scripts'), 'Missing key: scripts');
    assert(Array.isArray(parsed.scripts), 'scripts is not an array');
    assert(parsed.scripts.length >= 1, 'scripts array is empty');
    assert(
      parsed.scripts.includes('scripts/conflict-scanner.js'),
      `scripts array does not contain "scripts/conflict-scanner.js". Found: ${JSON.stringify(parsed.scripts)}`
    );
  }
);

// ---------------------------------------------------------------------------
// AC-4: Path matches actual file on disk
// ---------------------------------------------------------------------------
test(
  'AC-4',
  'GIVEN Slice 2 delivered plugins/clemens/scripts/conflict-scanner.js WHEN the path in the scripts key is compared to the actual file THEN the relative path matches -- no typo, no wrong directory',
  () => {
    const scriptRelPath = parsed.scripts.find((s) => s.includes('conflict-scanner'));
    assert(scriptRelPath, 'No conflict-scanner entry found in scripts array');

    const absolutePath = path.resolve(PLUGIN_ROOT, scriptRelPath);
    assert(
      fs.existsSync(absolutePath),
      `File does not exist at resolved path: ${absolutePath} (relative: ${scriptRelPath})`
    );

    // Double-check the canonical expected path
    const expectedAbsolute = path.resolve(PLUGIN_ROOT, 'scripts', 'conflict-scanner.js');
    assertEqual(
      path.normalize(absolutePath),
      path.normalize(expectedAbsolute),
      'Resolved path mismatch'
    );
  }
);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n--- Results: ${passed} passed, ${failed} failed (of ${passed + failed} total) ---`);
process.exit(exitCode);
