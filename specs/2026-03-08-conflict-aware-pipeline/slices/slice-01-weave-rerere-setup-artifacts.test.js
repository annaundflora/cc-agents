/**
 * Acceptance Tests for Slice 01: Weave + rerere Setup-Artifacts
 *
 * Stack: markdown-templates (no test framework — runs with `node <file>`)
 * Mocking Strategy: no_mocks
 *
 * Tests verify structural content of the two deliverables:
 *   - plugins/clemens/templates/gitattributes-weave.template
 *   - plugins/clemens/templates/weave-setup.md
 */

const fs = require("fs");
const path = require("path");

// ── Resolve paths relative to repo root ──────────────────────────────────────
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const GITATTRIBUTES_PATH = path.join(
  REPO_ROOT,
  "plugins",
  "clemens",
  "templates",
  "gitattributes-weave.template"
);
const WEAVE_SETUP_PATH = path.join(
  REPO_ROOT,
  "plugins",
  "clemens",
  "templates",
  "weave-setup.md"
);

// ── Helpers ──────────────────────────────────────────────────────────────────

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function assert(condition, testId, description) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  PASS  ${testId}: ${description}`);
  } else {
    failedTests++;
    failures.push(`${testId}: ${description}`);
    console.log(`  FAIL  ${testId}: ${description}`);
  }
}

function readFileChecked(filePath, label) {
  if (!fs.existsSync(filePath)) {
    console.error(`FATAL: ${label} not found at ${filePath}`);
    process.exit(1);
  }
  return fs.readFileSync(filePath, "utf-8");
}

// ── Load files ───────────────────────────────────────────────────────────────

const gitattributes = readFileChecked(GITATTRIBUTES_PATH, "gitattributes-weave.template");
const weaveSetup = readFileChecked(WEAVE_SETUP_PATH, "weave-setup.md");

// ═══════════════════════════════════════════════════════════════════════════════
// AC-1: GIVEN das Deliverable `gitattributes-weave.template` existiert
//       WHEN ein Dev die Datei oeffnet
//       THEN enthaelt sie einen `merge=weave` Treiber-Eintrag fuer alle
//            relevanten Quellcode-Dateierweiterungen UND funcname-Pattern-
//            Definitionen fuer mindestens TypeScript (.ts, .tsx), Python (.py)
//            und Go (.go) — Syntax valide fuer direkte Nutzung als .gitattributes
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n--- AC-1: gitattributes contains Weave driver + funcname patterns ---");

// merge=weave entries
assert(
  /^\*\.ts\s+merge=weave/m.test(gitattributes),
  "AC-1.1",
  "gitattributes-weave.template contains merge=weave for *.ts"
);

assert(
  /^\*\.tsx\s+merge=weave/m.test(gitattributes),
  "AC-1.2",
  "gitattributes-weave.template contains merge=weave for *.tsx"
);

assert(
  /^\*\.py\s+merge=weave/m.test(gitattributes),
  "AC-1.3",
  "gitattributes-weave.template contains merge=weave for *.py"
);

assert(
  /^\*\.go\s+merge=weave/m.test(gitattributes),
  "AC-1.4",
  "gitattributes-weave.template contains merge=weave for *.go"
);

// diff driver assignments for funcname patterns
assert(
  /^\*\.ts\s+diff=typescript/m.test(gitattributes),
  "AC-1.5",
  "gitattributes-weave.template contains diff=typescript for *.ts"
);

assert(
  /^\*\.tsx\s+diff=typescript/m.test(gitattributes),
  "AC-1.6",
  "gitattributes-weave.template contains diff=typescript for *.tsx"
);

assert(
  /^\*\.py\s+diff=python/m.test(gitattributes),
  "AC-1.7",
  "gitattributes-weave.template contains diff=python for *.py"
);

assert(
  /^\*\.go\s+diff=golang/m.test(gitattributes),
  "AC-1.8",
  "gitattributes-weave.template contains diff=golang for *.go"
);

// ═══════════════════════════════════════════════════════════════════════════════
// AC-2: GIVEN das Deliverable `weave-setup.md` existiert
//       WHEN ein Dev die Anleitung von oben nach unten folgt
//       THEN kann er alle Prerequisites (Rust/Cargo, weave-cli, weave-driver,
//            gh CLI) mit den enthaltenen Befehlen installieren — kein externer
//            Link muss geoeffnet werden, alle Befehle sind copy-paste-faehig
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n--- AC-2: weave-setup.md contains copy-paste installation commands ---");

// Rust/Cargo install via curl
assert(
  /curl\s.*sh\.rustup\.rs/s.test(weaveSetup),
  "AC-2.1",
  "weave-setup.md contains curl-based Rust/Cargo install command"
);

// weave-cli via cargo install --git
assert(
  /cargo\s+install\s+--git\s+https:\/\/github\.com\/Ataraxy-Labs\/weave\s+weave-cli/.test(weaveSetup),
  "AC-2.2",
  "weave-setup.md contains weave-cli cargo install from GitHub"
);

// weave-driver via cargo install --git
assert(
  /cargo\s+install\s+--git\s+https:\/\/github\.com\/Ataraxy-Labs\/weave\s+weave-driver/.test(weaveSetup),
  "AC-2.3",
  "weave-setup.md contains weave-driver cargo install from GitHub"
);

// gh CLI install commands (at least one package manager)
assert(
  /brew\s+install\s+gh/.test(weaveSetup) ||
    /apt\s+install\s+gh/.test(weaveSetup) ||
    /dnf\s+install\s+gh/.test(weaveSetup) ||
    /winget\s+install\s.*GitHub\.cli/.test(weaveSetup),
  "AC-2.4",
  "weave-setup.md contains gh CLI install via package manager (brew/apt/dnf/winget)"
);

// All four package managers for gh CLI present
assert(
  /brew\s+install\s+gh/.test(weaveSetup),
  "AC-2.5",
  "weave-setup.md contains gh install via brew"
);

assert(
  /apt\s+install\s+gh/.test(weaveSetup),
  "AC-2.6",
  "weave-setup.md contains gh install via apt"
);

assert(
  /dnf\s+install\s+gh/.test(weaveSetup),
  "AC-2.7",
  "weave-setup.md contains gh install via dnf"
);

assert(
  /winget\s+install\s.*GitHub\.cli/.test(weaveSetup),
  "AC-2.8",
  "weave-setup.md contains gh install via winget"
);

// ═══════════════════════════════════════════════════════════════════════════════
// AC-3: GIVEN `weave-setup.md` enthaelt den Repository-Setup-Abschnitt
//       WHEN ein Dev die Repo-Setup-Befehle ausfuehrt
//       THEN wird `git config rerere.enabled true` explizit aufgefuehrt UND
//            `weave-cli setup` als Befehl zum Einrichten des Merge Drivers
//            im Repo enthalten sein
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n--- AC-3: git rerere + weave-cli setup in setup guide ---");

assert(
  /git\s+config\s+rerere\.enabled\s+true/.test(weaveSetup),
  "AC-3.1",
  "weave-setup.md contains 'git config rerere.enabled true'"
);

assert(
  /weave-cli\s+setup/.test(weaveSetup),
  "AC-3.2",
  "weave-setup.md contains 'weave-cli setup' as repo setup command"
);

// Verify the setup section exists
assert(
  /Repository\s+Setup/i.test(weaveSetup),
  "AC-3.3",
  "weave-setup.md has a Repository Setup section"
);

// ═══════════════════════════════════════════════════════════════════════════════
// AC-4: GIVEN das Template `gitattributes-weave.template`
//       WHEN ein Dev es als `.gitattributes` in ein Repo kopiert und `git diff`
//            auf eine TypeScript-Datei ausfuehrt
//       THEN zeigen die @@-Hunk-Header Entity-Namen (Funktionsnamen) statt nur
//            Zeilennummern — Voraussetzung: funcname-Pattern fuer
//            `*.ts diff=typescript` ist korrekt
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n--- AC-4: funcname patterns are valid regex-like patterns ---");

// Extract the commented-out xfuncname patterns from the gitattributes template
// These patterns are provided as manual fallback in comments

// TypeScript funcname pattern — should match function declarations
const tsPatternMatch = gitattributes.match(
  /\[diff\s+"typescript"\]\s*\n#\s*xfuncname\s*=\s*"([^"]+)"/
);
assert(
  tsPatternMatch !== null,
  "AC-4.1",
  "gitattributes-weave.template contains a TypeScript xfuncname pattern (commented fallback)"
);

if (tsPatternMatch) {
  const tsPattern = tsPatternMatch[1];
  // Pattern should reference function-like constructs
  assert(
    /function/.test(tsPattern) || /class/.test(tsPattern) || /const/.test(tsPattern),
    "AC-4.2",
    "TypeScript funcname pattern matches function/class/const declarations"
  );

  // Pattern should be POSIX ERE syntax (contains character classes like [:space:])
  assert(
    /\[\[:space:\]\]/.test(tsPattern) || /\[\[:alnum:\]\]/.test(tsPattern),
    "AC-4.3",
    "TypeScript funcname pattern uses POSIX ERE character classes ([:space:], [:alnum:])"
  );
}

// Python funcname pattern
const pyPatternMatch = gitattributes.match(
  /\[diff\s+"python"\]\s*\n#\s*xfuncname\s*=\s*"([^"]+)"/
);
assert(
  pyPatternMatch !== null,
  "AC-4.4",
  "gitattributes-weave.template contains a Python xfuncname pattern (commented fallback)"
);

if (pyPatternMatch) {
  const pyPattern = pyPatternMatch[1];
  assert(
    /def/.test(pyPattern) || /class/.test(pyPattern),
    "AC-4.5",
    "Python funcname pattern matches def/class declarations"
  );
}

// Go funcname pattern
const goPatternMatch = gitattributes.match(
  /\[diff\s+"golang"\]\s*\n#\s*xfuncname\s*=\s*"([^"]+)"/
);
assert(
  goPatternMatch !== null,
  "AC-4.6",
  "gitattributes-weave.template contains a Go xfuncname pattern (commented fallback)"
);

if (goPatternMatch) {
  const goPattern = goPatternMatch[1];
  assert(
    /func/.test(goPattern),
    "AC-4.7",
    "Go funcname pattern matches func declarations"
  );
}

// The diff=typescript attribute assignment is present for *.ts (validates the chain works)
assert(
  /^\*\.ts\s+diff=typescript/m.test(gitattributes),
  "AC-4.8",
  "*.ts diff=typescript attribute is set — prerequisite for hunk header entity names"
);

// ═══════════════════════════════════════════════════════════════════════════════
// AC-5: GIVEN `weave-setup.md`
//       WHEN ein Dev nach der Installation den optionalen Validierungsschritt
//            ausfuehrt
//       THEN zeigt `weave-cli setup --dry-run` oder ein aequivalenter
//            Verifikationsbefehl dass Setup erfolgreich waere — der
//            Verifikationsschritt ist in der Anleitung dokumentiert
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n--- AC-5: Verification step documented in setup guide ---");

assert(
  /weave-cli\s+setup\s+--dry-run/.test(weaveSetup),
  "AC-5.1",
  "weave-setup.md contains 'weave-cli setup --dry-run' verification command"
);

// Verification section exists
assert(
  /Verif(y|ication)/i.test(weaveSetup),
  "AC-5.2",
  "weave-setup.md has a Verification section"
);

// dry-run explanation
assert(
  /dry.run/i.test(weaveSetup) && /weave-cli\s+setup/i.test(weaveSetup),
  "AC-5.3",
  "weave-setup.md explains the dry-run verification step"
);

// ═══════════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n══════════════════════════════════════════════════");
console.log(`  Total: ${totalTests}  Passed: ${passedTests}  Failed: ${failedTests}`);
console.log("══════════════════════════════════════════════════");

if (failedTests > 0) {
  console.log("\nFailed tests:");
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
} else {
  console.log("\nAll tests passed.");
  process.exit(0);
}
