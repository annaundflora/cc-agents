/**
 * Structural acceptance tests for conflict-reporter.md agent definition
 * Slice: slice-05-conflict-reporter-sub-agent
 *
 * Runs with: node plugins/clemens/agents/conflict-reporter.test.js
 * Exit code 1 on any failure.
 */

const fs = require("fs");
const path = require("path");

const AGENT_FILE = path.join(__dirname, "conflict-reporter.md");

let content;
try {
  content = fs.readFileSync(AGENT_FILE, "utf-8");
} catch (err) {
  console.error("FAIL: Could not read conflict-reporter.md:", err.message);
  process.exit(1);
}

const contentLower = content.toLowerCase();
let passed = 0;
let failed = 0;
const results = [];

function check(acId, description, condition) {
  if (condition) {
    results.push(`  pass  ${acId}: ${description}`);
    passed++;
  } else {
    results.push(`  FAIL  ${acId}: ${description}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// AC-1: 4 Pflichtbloecke vorhanden
// GIVEN conflict-reporter.md existiert in plugins/clemens/agents/
// WHEN der Implementer die Datei manuell reviewt
// THEN enthaelt die Agent-Definition alle vier Pflichtbloecke:
//   1) Task-Context-Anweisung (overlap-report.json lesen via Read Tool)
//   2) Comment-Format-Spezifikation (Tabelle + Kontext-Abschnitt + Empfehlung)
//   3) Bash-Aufruf-Anweisungen fuer gh issue comment in beide Issues
//   4) JSON-Output-Schema
// ---------------------------------------------------------------------------

check(
  "AC-1a",
  'Pflichtblock "Task-Context" vorhanden — overlap-report.json via Read-Tool lesen',
  content.includes("overlap-report.json") &&
    /read.*tool/i.test(content) &&
    // Agent must explicitly prohibit Bash cat for reading JSON
    /nicht.*bash.*cat|keine.*bash.*cat/i.test(content)
);

check(
  "AC-1b",
  'Pflichtblock "Comment-Format" vorhanden — Tabelle + Kontext + Empfehlung spezifiziert',
  content.includes("Datei") &&
    content.includes("Entity") &&
    /\*\*Kontext/i.test(content) &&
    /\*\*Empfehlung/i.test(content)
);

check(
  "AC-1c",
  'Pflichtblock "gh issue comment Aufrufe" vorhanden — beide Issues adressiert',
  content.includes("gh issue comment") &&
    /own_issue/i.test(content) &&
    /their_issue/i.test(content)
);

check(
  "AC-1d",
  'Pflichtblock "JSON-Output-Schema" vorhanden — alle 4 Felder definiert',
  content.includes('"status"') &&
    content.includes('"commented"') &&
    content.includes('"issues_commented"') &&
    content.includes('"notes"')
);

// ---------------------------------------------------------------------------
// AC-2: Input-Verarbeitung — Read-Tool, kein Bash cat; Felder extrahiert
// GIVEN der Agent via Task() mit overlap_report_path, own_issue_number, repo
// WHEN der Agent overlap-report.json liest und Daten verarbeitet
// THEN liest er via Read-Tool und extrahiert overlaps[], summary,
//      weave_validation und feature — ohne Fallback auf externe Quellen
// ---------------------------------------------------------------------------

check(
  "AC-2a",
  'Agent liest via Read-Tool (nicht Bash cat)',
  /read.*tool/i.test(content) &&
    // Explicit prohibition of Bash cat for reading JSON
    /nicht.*bash.*cat|kein.*bash.*cat|not.*bash.*cat/i.test(content)
);

check(
  "AC-2b",
  "Agent extrahiert overlaps[], summary, weave_validation, feature",
  content.includes("overlaps") &&
    content.includes("summary") &&
    content.includes("weave_validation") &&
    content.includes("feature")
);

// ---------------------------------------------------------------------------
// AC-3: Comment-Format — Tabellenspalten + Kontext + Empfehlung
// GIVEN overlap-report.json enthaelt mindestens einen Overlap mit severity: "high"
// WHEN der Agent den Issue-Comment formuliert
// THEN enthaelt der Comment eine Markdown-Tabelle mit den Spalten
//      Datei, Entity, Diese Session, Konflikt mit, Andere Session
//      sowie einen **Kontext:**-Abschnitt und einen **Empfehlung:**-Abschnitt
// ---------------------------------------------------------------------------

// Check for exact column names in a markdown table row
const tableHeaderPattern =
  /\|\s*Datei\s*\|\s*Entity\s*\|\s*Diese Session\s*\|\s*Konflikt mit\s*\|\s*Andere Session\s*\|/;

check(
  "AC-3a",
  "Tabelle enthaelt exakte Spalten: Datei, Entity, Diese Session, Konflikt mit, Andere Session",
  tableHeaderPattern.test(content)
);

check(
  "AC-3b",
  'Comment enthaelt **Kontext:**-Abschnitt',
  /\*\*Kontext[:\*]/i.test(content)
);

check(
  "AC-3c",
  'Comment enthaelt **Empfehlung:**-Abschnitt',
  /\*\*Empfehlung[:\*]/i.test(content)
);

// ---------------------------------------------------------------------------
// AC-4: Empfehlung bei auto_resolvable=false oder null
// GIVEN weave_validation.auto_resolvable ist false oder weave_validation ist null
// WHEN der Agent die Empfehlung formuliert
// THEN enthaelt die Empfehlung "Manueller Review empfohlen" und den Hinweis,
//      dass Weave diese Entity nicht automatisch mergen kann
// ---------------------------------------------------------------------------

check(
  "AC-4",
  '"Manueller Review empfohlen" bei auto_resolvable=false oder null',
  content.includes("Manueller Review empfohlen") &&
    // Must mention that Weave cannot auto-merge
    (/nicht automatisch mergen/i.test(content) ||
      /nicht automatisch.*loesen/i.test(content) ||
      /NICHT automatisch mergen/i.test(content))
);

// ---------------------------------------------------------------------------
// AC-5: Empfehlung bei auto_resolvable=true
// GIVEN weave_validation.auto_resolvable ist true (Overlaps severity: "low")
// WHEN der Agent die Empfehlung formuliert
// THEN enthaelt die Empfehlung "Weave" + "automatisch" und KEINE Eskalation
// ---------------------------------------------------------------------------

// Find the recommendation block for auto_resolvable == true
const autoResolvableTruePattern =
  /auto_resolvable\s*==?\s*true/i;
const weaveAutoPattern =
  /weave\s+l(oe|ö)st?\s+automatisch/i;

check(
  "AC-5",
  '"Weave loest automatisch" bei auto_resolvable=true, keine Eskalation',
  autoResolvableTruePattern.test(content) && weaveAutoPattern.test(content)
);

// ---------------------------------------------------------------------------
// AC-6: gh issue comment Aufrufe fuer own_issue_number + their_issue Nummern
// GIVEN own_issue_number und alle overlaps[].their_issue-Nummern sind bekannt
// WHEN der Agent gh issue comment aufruft
// THEN fuehrt er via Bash-Tool mindestens zwei Aufrufe aus:
//      einen fuer own_issue_number und je einen fuer jede their_issue-Nummer
//      beide mit --repo {repo} und identischem Comment-Body mit @{their_user}
// ---------------------------------------------------------------------------

check(
  "AC-6a",
  "gh issue comment fuer own_issue_number aufrufen",
  // The agent definition must show gh issue comment with own_issue_number
  /gh\s+issue\s+comment\s+\{?own_issue_number\}?/i.test(content) ||
    /gh\s+issue\s+comment.*own_issue/i.test(content)
);

check(
  "AC-6b",
  "gh issue comment fuer jede their_issue-Nummer aufrufen",
  /gh\s+issue\s+comment\s+\{?their_issue\}?/i.test(content) ||
    /gh\s+issue\s+comment.*their_issue/i.test(content)
);

check(
  "AC-6c",
  "Comment-Body enthaelt @{their_user} Mention",
  /@\{?their_user\}?/.test(content)
);

// ---------------------------------------------------------------------------
// AC-7: JSON-Output-Schema definiert exakt status/commented/issues_commented/notes
// GIVEN alle gh issue comment-Aufrufe sind abgeschlossen
// WHEN der Agent das Ergebnis zurueckgibt
// THEN ist der Output ein valides JSON-Objekt mit genau diesen Feldern:
//      status ("completed" oder "failed"), commented (Boolean),
//      issues_commented (Integer-Array), notes (String)
// ---------------------------------------------------------------------------

check(
  "AC-7a",
  "Output enthaelt genau: status, commented, issues_commented, notes",
  content.includes('"status"') &&
    content.includes('"commented"') &&
    content.includes('"issues_commented"') &&
    content.includes('"notes"')
);

// Verify issues_commented is defined as Integer-Array
check(
  "AC-7b",
  "issues_commented ist Integer-Array",
  // Look for the field defined as array type or shown as array example
  (/issues_commented.*Integer\[\]/i.test(content) ||
    /issues_commented.*\[.*\d+.*\]/i.test(content) ||
    /"issues_commented"\s*:\s*\[\s*\d+/.test(content))
);

// ---------------------------------------------------------------------------
// AC-8: Fehlerbehandlung bei gh-Fehler
// GIVEN ein gh issue comment-Aufruf schlaegt fehl
// WHEN der Agent den Fehler erhaelt
// THEN setzt er status: "failed" und commented: false im Output-JSON
//      und loggt die Fehlerursache in notes
// ---------------------------------------------------------------------------

check(
  "AC-8",
  'Bei gh-Fehler: status="failed", commented=false, notes enthaelt Fehlerursache',
  content.includes('"failed"') &&
    // Must mention commented: false in error context
    (/failed.*commented.*false/is.test(content) ||
      (content.includes('"failed"') && content.includes("false"))) &&
    // Must mention logging error to notes
    /notes.*fehler|notes.*error|fehler.*notes/i.test(content)
);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log("=== Conflict-Reporter Agent Definition Tests ===\n");
results.forEach((r) => console.log(r));
console.log(`\n--- ${passed} passed, ${failed} failed ---`);

if (failed > 0) {
  process.exit(1);
}
