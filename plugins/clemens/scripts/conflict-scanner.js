#!/usr/bin/env node
/**
 * conflict-scanner.js
 *
 * Slice 02 — Entity-Extraktion & Claims
 * Modules: CLI Parser | Entity Extractor | Claims Writer
 *
 * Usage:
 *   node conflict-scanner.js --branch <branch> --spec-path <path> --repo <owner/repo> [--weave]
 *
 * Exit codes:
 *   0  — Success (claims.json written)
 *   2  — Error (invalid args, git/weave failure)
 *
 * Note: Exit code 1 (overlap found) is NOT part of this slice — that is Slice 03.
 */

'use strict';

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// MODULE 1: CLI Parser
// ---------------------------------------------------------------------------

/**
 * Parse process.argv into a structured args object.
 * Validates all required arguments and exits with code 2 on failure.
 *
 * @returns {{ branch: string, specPath: string, repo: string, useWeave: boolean }}
 */
function parseArgs() {
  const argv = process.argv.slice(2);
  const args = {};

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--branch') {
      args.branch = argv[i + 1];
      i++;
    } else if (token === '--spec-path') {
      args.specPath = argv[i + 1];
      i++;
    } else if (token === '--repo') {
      args.repo = argv[i + 1];
      i++;
    } else if (token === '--weave') {
      args.useWeave = true;
    }
  }

  const missing = [];
  if (!args.branch) missing.push('--branch');
  if (!args.specPath) missing.push('--spec-path');
  if (!args.repo) missing.push('--repo');

  if (missing.length > 0) {
    process.stderr.write(
      `Error: Missing required arguments: ${missing.join(', ')}\n`
    );
    process.exit(2);
  }

  // Validate --branch: must be non-empty (already guaranteed above)
  if (args.branch.trim() === '') {
    process.stderr.write('Error: Invalid branch: value must not be empty\n');
    process.exit(2);
  }

  // Validate --repo: must match owner/repo pattern
  if (!/^[^/\s]+\/[^/\s]+$/.test(args.repo)) {
    process.stderr.write(
      `Error: Invalid repo format: expected owner/repo, got "${args.repo}"\n`
    );
    process.exit(2);
  }

  // Validate --spec-path: directory must exist
  const resolvedSpecPath = path.resolve(args.specPath);
  if (!fs.existsSync(resolvedSpecPath) || !fs.statSync(resolvedSpecPath).isDirectory()) {
    process.stderr.write(
      `Error: Spec path not found or not a directory: "${args.specPath}"\n`
    );
    process.exit(2);
  }

  // Validate we are inside a git repository
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'pipe' });
  } catch (_) {
    process.stderr.write('Error: Not a git repository\n');
    process.exit(2);
  }

  return {
    branch: args.branch,
    specPath: resolvedSpecPath,
    repo: args.repo,
    useWeave: Boolean(args.useWeave),
  };
}

// ---------------------------------------------------------------------------
// MODULE 2: Entity Extractor
// ---------------------------------------------------------------------------

/**
 * Hunk header regex:
 *   @@ -<old_start>[,<old_count>] +<new_start>[,<new_count>] @@ <funcname>
 */
const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)?$/;

/**
 * Determine entity_type and entity name from the funcname portion of a hunk header.
 *
 * Heuristic table (architecture.md → Section "Entity Extraction Strategy"):
 *   function {name}      → function
 *   class {name}         → class
 *   def {name}           → function
 *   func {name}          → function
 *   {name}.*method/indent→ method
 *   no match             → unknown
 *
 * @param {string} funcname  — text after the second @@ (may be empty)
 * @returns {{ entity: string|null, entity_type: string }}
 */
function classifyEntity(funcname) {
  if (!funcname || funcname.trim() === '') {
    return { entity: null, entity_type: 'unknown' };
  }

  const trimmed = funcname.trim();

  // function <name>
  let m = trimmed.match(/\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
  if (m) return { entity: m[1], entity_type: 'function' };

  // class <name>
  m = trimmed.match(/\bclass\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
  if (m) return { entity: m[1], entity_type: 'class' };

  // def <name> (Python)
  m = trimmed.match(/\bdef\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (m) return { entity: m[1], entity_type: 'function' };

  // func <name> (Go) — may have receiver: func (s *Scanner) Run()
  m = trimmed.match(/\bfunc\s+(?:\([^)]*\)\s+)?([A-Za-z_][A-Za-z0-9_]*)/);
  if (m) return { entity: m[1], entity_type: 'function' };

  // method heuristic: indented name followed by () or contains 'method' keyword
  // e.g. "  async handleSubmit()" or "  handleSubmit()"
  m = trimmed.match(/^(?:async\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/);
  if (m && /^\s{2,}/.test(funcname)) {
    return { entity: m[1], entity_type: 'method' };
  }

  // Fallback: return the trimmed funcname as unknown entity
  return { entity: null, entity_type: 'unknown' };
}

/**
 * Parse `git diff main...{branch} --unified=0` output into per-hunk records.
 *
 * @param {string} diffOutput  — raw stdout from git diff
 * @returns {Array<{ file: string, entity: string|null, entity_type: string, lines: [number, number], diff_summary: string, isNewFile: boolean }>}
 */
function parseDiffHunks(diffOutput) {
  const lines = diffOutput.split('\n');
  const hunks = [];

  let currentFile = null;
  let isNewFile = false;

  for (const line of lines) {
    // Track current file
    if (line.startsWith('diff --git ')) {
      // Reset new-file flag for each file section
      isNewFile = false;
      // Extract filename from "diff --git a/<file> b/<file>"
      const fm = line.match(/^diff --git a\/.+ b\/(.+)$/);
      if (fm) {
        currentFile = fm[1];
      }
      continue;
    }

    // Detect new file marker
    if (line.startsWith('new file mode')) {
      isNewFile = true;
      continue;
    }

    // Parse hunk header
    if (line.startsWith('@@')) {
      const hm = line.match(HUNK_HEADER_RE);
      if (!hm || !currentFile) continue;

      const oldStart = parseInt(hm[1], 10);
      const oldCount = hm[2] !== undefined ? parseInt(hm[2], 10) : 1;
      const newStart = parseInt(hm[3], 10);
      const newCount = hm[4] !== undefined ? parseInt(hm[4], 10) : 1;
      const funcname = hm[5] || '';

      const lineStart = newStart;
      const lineEnd = newStart + Math.max(newCount - 1, 0);

      const added = newCount;
      const removed = oldCount;
      const diffSummary = `+${added} -${removed}`;

      if (isNewFile) {
        hunks.push({
          file: currentFile,
          entity: null,
          entity_type: 'new_file',
          lines: [lineStart, lineEnd],
          diff_summary: diffSummary,
          isNewFile: true,
        });
      } else {
        const { entity, entity_type } = classifyEntity(funcname);
        hunks.push({
          file: currentFile,
          entity,
          entity_type,
          lines: [lineStart, lineEnd],
          diff_summary: diffSummary,
          isNewFile: false,
        });
      }
    }
  }

  return hunks;
}

/**
 * Run `git diff main...{branch} --unified=0` and return the output.
 * Uses spawnSync with an argument array so the branch name is never
 * interpreted by the shell — prevents shell injection regardless of
 * characters in the branch name.
 * Exits with code 2 on failure.
 *
 * @param {string} branch
 * @returns {string}
 */
function runGitDiff(branch) {
  const result = spawnSync('git', ['diff', `main...${branch}`, '--unified=0'], {
    encoding: 'utf8',
  });
  if (result.error) {
    process.stderr.write(`Error running git diff: ${result.error.message}\n`);
    process.exit(2);
  }
  if (result.status !== 0) {
    // git diff exits non-zero only on real errors (e.g. unknown revision).
    // A diff with no changes exits 0.
    const stderr = result.stderr || '';
    process.stderr.write(`Error running git diff: ${stderr}\n`);
    process.exit(2);
  }
  return result.stdout || '';
}

/**
 * Try to run `weave-cli preview main` and parse its output as entity list.
 * Returns null if weave-cli is not available (AC-8: fallback to git diff).
 *
 * weave-cli has no --json flag (documented limitation). We parse text output
 * looking for file/entity references in the preview output.
 *
 * @returns {Array<{ file: string, entity: string|null, entity_type: string, lines: [number, number], diff_summary: string, isNewFile: boolean }>|null}
 */
function runWeavePreview() {
  const weaveResult = spawnSync('weave-cli', ['preview', 'main'], { encoding: 'utf8' });
  if (weaveResult.error || weaveResult.status !== 0) {
    // weave-cli not in PATH or failed — AC-8: warn and return null
    process.stderr.write(
      'Warning: weave-cli not available or failed, falling back to git diff parsing\n'
    );
    return null;
  }
  let weaveOutput = weaveResult.stdout || '';

  // Parse weave-cli text output.
  // Expected format (weave v0.2.3): lines like
  //   "file: src/foo.ts  entity: myFunction  type: function  status: modified"
  // or tabular output. We do a best-effort parse.
  const result = [];
  const lines = weaveOutput.split('\n');

  for (const line of lines) {
    // Try structured line: "file: <f>  entity: <e>  type: <t>"
    const fm = line.match(/file:\s*(\S+)\s+entity:\s*(\S+)\s+type:\s*(\S+)/i);
    if (fm) {
      result.push({
        file: fm[1],
        entity: fm[2] === 'null' ? null : fm[2],
        entity_type: fm[3],
        lines: [0, 0],
        diff_summary: '+? -?',
        isNewFile: false,
      });
      continue;
    }

    // Fallback: line contains a recognizable entity pattern
    const em = line.match(/\b(?:function|class|def|func)\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (em) {
      const { entity, entity_type } = classifyEntity(line);
      result.push({
        file: 'unknown',
        entity,
        entity_type,
        lines: [0, 0],
        diff_summary: '+? -?',
        isNewFile: false,
      });
    }
  }

  // If weave produced output but we couldn't parse any entities, fall back
  if (result.length === 0 && weaveOutput.trim().length > 0) {
    process.stderr.write(
      'Warning: weave-cli output could not be parsed, falling back to git diff parsing\n'
    );
    return null;
  }

  return result.length > 0 ? result : null;
}

/**
 * Extract entities from the branch, optionally using weave-cli.
 * Applies the Top-50 cap per architecture.md Risks section.
 *
 * @param {string} branch
 * @param {boolean} useWeave
 * @returns {Array<{ file: string, entity: string|null, entity_type: string, lines: [number, number], diff_summary: string, isNewFile: boolean }>}
 */
function extractEntities(branch, useWeave) {
  let hunks = null;

  if (useWeave) {
    hunks = runWeavePreview();
    // null means fallback to git diff (AC-8)
  }

  if (hunks === null) {
    const diffOutput = runGitDiff(branch);
    hunks = parseDiffHunks(diffOutput);
  }

  // Apply Top-50 cap (GitHub Issue Body Limit)
  if (hunks.length > 50) {
    hunks = hunks.slice(0, 50);
  }

  return hunks;
}

// ---------------------------------------------------------------------------
// MODULE 3: Claims Writer
// ---------------------------------------------------------------------------

/**
 * Build summary statistics from the extracted entity list.
 *
 * @param {Array} entities
 * @returns {{ files_changed: number, entities_changed: number, new_files: number }}
 */
function buildSummary(entities) {
  const uniqueFiles = new Set();
  let newFiles = 0;
  const newFilesSeen = new Set();

  for (const e of entities) {
    uniqueFiles.add(e.file);
    if (e.isNewFile && !newFilesSeen.has(e.file)) {
      newFiles++;
      newFilesSeen.add(e.file);
    }
  }

  return {
    files_changed: uniqueFiles.size,
    entities_changed: entities.length,
    new_files: newFiles,
  };
}

/**
 * Write claims.json to the spec-path directory.
 * Strips internal `isNewFile` flag before writing.
 *
 * @param {string} specPath
 * @param {Array} entities
 */
function writeClaims(specPath, entities) {
  const summary = buildSummary(entities);

  const entitiesForOutput = entities.map(({ isNewFile: _dropped, ...rest }) => rest);

  const claims = {
    entities_changed: entitiesForOutput,
    summary,
  };

  const claimsPath = path.join(specPath, 'claims.json');
  try {
    fs.writeFileSync(claimsPath, JSON.stringify(claims, null, 2), 'utf8');
  } catch (err) {
    process.stderr.write(`Error writing claims.json: ${err.message}\n`);
    process.exit(2);
  }

  return claimsPath;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  // Step 1: Parse and validate CLI args
  const { branch, specPath, repo, useWeave } = parseArgs();

  // Step 2: Extract entities
  const entities = extractEntities(branch, useWeave);

  // Step 3: Write claims.json
  const claimsPath = writeClaims(specPath, entities);

  const summary = buildSummary(entities);

  // Slice 03 will extend this script with GitHub registry, overlap calculation,
  // report writing, and final exit code logic. For now we output the summary
  // and exit 0 to indicate successful claims extraction.
  const output = {
    status: 'claims_written',
    claims_path: claimsPath,
    repo,
    branch,
    summary,
  };

  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  process.exit(0);
}

main();
