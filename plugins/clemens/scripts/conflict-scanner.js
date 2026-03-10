#!/usr/bin/env node
/**
 * conflict-scanner.js
 *
 * Slice 02 — Entity-Extraktion & Claims
 * Slice 03 — GitHub Registry, Overlap & Report
 * Modules: CLI Parser | Entity Extractor | Claims Writer |
 *          Session Registry | Overlap Calculator | Report Writer | Exit Handler
 *
 * Usage:
 *   node conflict-scanner.js --branch <branch> --spec-path <path> --repo <owner/repo> [--weave]
 *
 * Exit codes:
 *   0  — No overlaps found
 *   1  — Overlaps found
 *   2  — Error (invalid args, git/gh failure)
 */

'use strict';

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
  const specPathRelative = args.specPath; // keep the original relative (or absolute) path as provided by the caller
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
    specPath: resolvedSpecPath,       // absolute path — used for all fs operations
    specPathRelative,                  // original path as supplied — used in GitHub Issue body
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
 * Try to run `weave-cli preview main` once and return both the raw output
 * and the parsed entity list.
 * Returns null for both fields if weave-cli is not available (AC-8: fallback to git diff).
 *
 * weave-cli has no --json flag (documented limitation). We parse text output
 * looking for file/entity references in the preview output.
 *
 * @returns {{ rawOutput: string, entities: Array<{ file: string, entity: string|null, entity_type: string, lines: [number, number], diff_summary: string, isNewFile: boolean }>|null }}
 */
function runWeavePreview() {
  const weaveResult = spawnSync('weave-cli', ['preview', 'main'], { encoding: 'utf8' });
  if (weaveResult.error || weaveResult.status !== 0) {
    // weave-cli not in PATH or failed — AC-8: warn and return null
    process.stderr.write(
      'Warning: weave-cli not available or failed, falling back to git diff parsing\n'
    );
    return { rawOutput: null, entities: null };
  }
  const rawOutput = weaveResult.stdout || '';

  // Parse weave-cli text output.
  // Expected format (weave v0.2.3): lines like
  //   "file: src/foo.ts  entity: myFunction  type: function  status: modified"
  // or tabular output. We do a best-effort parse.
  const result = [];
  const lines = rawOutput.split('\n');

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
  if (result.length === 0 && rawOutput.trim().length > 0) {
    process.stderr.write(
      'Warning: weave-cli output could not be parsed, falling back to git diff parsing\n'
    );
    return { rawOutput, entities: null };
  }

  return { rawOutput, entities: result.length > 0 ? result : null };
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
    const { entities } = runWeavePreview();
    hunks = entities; // null means fallback to git diff (AC-8)
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
// MODULE 4: Session Registry
// ---------------------------------------------------------------------------

/**
 * Build a clean environment for gh CLI calls that forces keyring auth.
 * Excludes GITHUB_TOKEN so gh uses the token from `gh auth login`.
 * Does NOT modify process.env — the caller's environment stays untouched.
 *
 * @returns {Object} env copy without GITHUB_TOKEN
 */
function ghEnv() {
  const env = Object.assign({}, process.env);
  delete env.GITHUB_TOKEN;
  return env;
}

/**
 * Check that the gh CLI is available and authenticated via keyring.
 * Exits with code 2 and writes to stderr if not.
 */
function assertGhAuth() {
  const result = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8', env: ghEnv() });
  if (result.error || result.status !== 0) {
    process.stderr.write('GitHub CLI not authenticated. Run: gh auth login\n');
    process.exit(2);
  }
}

/**
 * Build the GitHub Issue body per architecture.md "Schema Details: GitHub Issue Body".
 *
 * @param {string} sessionId
 * @param {string} feature
 * @param {string} branch
 * @param {string} specPath
 * @param {string} startedAt  — ISO 8601
 * @param {Object} claims     — { entities_changed, summary }
 * @returns {string}
 */
function buildIssueBody(sessionId, feature, branch, specPath, startedAt, claims) {
  const sessionBlock = JSON.stringify(
    {
      session_id: sessionId,
      feature,
      branch,
      spec_path: specPath,
      started_at: startedAt,
    },
    null,
    2
  );

  const claimsBlock = JSON.stringify(
    {
      entities_changed: claims.entities_changed,
      summary: claims.summary,
    },
    null,
    2
  );

  return `## Session\n\n\`\`\`json\n${sessionBlock}\n\`\`\`\n\n## Entity Claims\n\n\`\`\`json\n${claimsBlock}\n\`\`\``;
}

/**
 * Derive a human-readable feature name from the branch name.
 * e.g. "feature/workspace-redesign" → "workspace-redesign"
 *
 * @param {string} branch
 * @returns {string}
 */
function featureFromBranch(branch) {
  // Strip common prefixes like "feature/", "feat/", etc.
  return branch.replace(/^(?:feature|feat|fix|chore|refactor)\//, '');
}

/**
 * Create a GitHub Issue for this pipeline session and return the issue number.
 *
 * @param {string} repo
 * @param {string} feature
 * @param {string} body
 * @returns {number}  — issue number
 */
function createIssue(repo, feature, body) {
  const result = spawnSync(
    'gh',
    [
      'issue', 'create',
      '--repo', repo,
      '--title', `Pipeline: ${feature}`,
      '--label', 'pipeline:running',
      '--body', body,
    ],
    { encoding: 'utf8', env: ghEnv() }
  );

  if (result.error || result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    process.stderr.write(`Warning: could not create GitHub issue: ${stderr}\n`);
    return 0;
  }

  // gh issue create prints the URL of the created issue, e.g.:
  //   https://github.com/owner/repo/issues/42
  const stdout = (result.stdout || '').trim();
  const m = stdout.match(/\/issues\/(\d+)$/);
  if (m) {
    return parseInt(m[1], 10);
  }

  // Fallback: try to parse a bare issue number
  const num = parseInt(stdout, 10);
  if (!isNaN(num)) return num;

  // Cannot determine issue number — return 0 (non-fatal for overlap detection)
  process.stderr.write(`Warning: could not parse issue number from gh output: ${stdout}\n`);
  return 0;
}

/**
 * List all open issues with label "pipeline:running" and return their parsed
 * entity-claims (excluding our own issue).
 *
 * Invalid JSON bodies are skipped with a stderr warning (AC-3).
 *
 * @param {string} repo
 * @param {number} ownIssueNumber  — exclude this issue from results
 * @returns {Array<{ issueNumber: number, feature: string, user: string, entities_changed: Array, summary: Object }>}
 */
function readOtherSessions(repo, ownIssueNumber) {
  const result = spawnSync(
    'gh',
    [
      'issue', 'list',
      '--repo', repo,
      '--label', 'pipeline:running',
      '--limit', '100',
      '--json', 'number,title,body',
    ],
    { encoding: 'utf8', env: ghEnv() }
  );

  if (result.error || result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    process.stderr.write(`Warning: gh issue list failed: ${stderr}\n`);
    return [];
  }

  let issues;
  try {
    issues = JSON.parse(result.stdout || '[]');
  } catch (_) {
    process.stderr.write('Warning: could not parse gh issue list output\n');
    return [];
  }

  const sessions = [];

  for (const issue of issues) {
    if (issue.number === ownIssueNumber) continue;

    const body = issue.body || '';

    // Extract the Entity Claims JSON block from the issue body
    // Format: ## Entity Claims\n\n```json\n{...}\n```
    const claimsBlockMatch = body.match(
      /##\s+Entity Claims[\s\S]*?```json\s*([\s\S]*?)```/i
    );

    if (!claimsBlockMatch) {
      process.stderr.write(`Skipping issue #${issue.number}: invalid JSON\n`);
      continue;
    }

    let claims;
    try {
      claims = JSON.parse(claimsBlockMatch[1]);
    } catch (_) {
      process.stderr.write(`Skipping issue #${issue.number}: invalid JSON\n`);
      continue;
    }

    if (!claims || !Array.isArray(claims.entities_changed)) {
      process.stderr.write(`Skipping issue #${issue.number}: invalid JSON\n`);
      continue;
    }

    // Extract session info for feature name + user
    let sessionFeature = issue.title.replace(/^Pipeline:\s*/, '').trim();
    let sessionUser = '';

    const sessionBlockMatch = body.match(
      /##\s+Session[\s\S]*?```json\s*([\s\S]*?)```/i
    );
    if (sessionBlockMatch) {
      try {
        const sessionData = JSON.parse(sessionBlockMatch[1]);
        if (sessionData.feature) sessionFeature = sessionData.feature;
      } catch (_) {
        // ignore — sessionFeature already set from title
      }
    }

    sessions.push({
      issueNumber: issue.number,
      feature: sessionFeature,
      user: sessionUser,
      entities_changed: claims.entities_changed,
      summary: claims.summary || {},
    });
  }

  return sessions;
}

/**
 * Register session on GitHub: authenticate, create issue, read other sessions.
 *
 * @param {string} repo
 * @param {string} sessionId
 * @param {string} feature
 * @param {string} branch
 * @param {string} specPath
 * @param {string} startedAt
 * @param {Object} claims
 * @returns {{ ownIssueNumber: number, otherSessions: Array }}
 */
function registerSession(repo, sessionId, feature, branch, specPath, startedAt, claims) {
  // AC-1: Check gh auth before creating any issue
  assertGhAuth();

  // AC-2: Create issue with correct title, label, and body
  const body = buildIssueBody(sessionId, feature, branch, specPath, startedAt, claims);
  const ownIssueNumber = createIssue(repo, feature, body);

  // AC-3: Read other sessions, skip invalid JSON
  const otherSessions = readOtherSessions(repo, ownIssueNumber);

  return { ownIssueNumber, otherSessions };
}

// ---------------------------------------------------------------------------
// MODULE 5: Overlap Calculator
// ---------------------------------------------------------------------------

/**
 * Compute overlaps between our entities and other sessions' entities.
 * Implements the deterministic algorithm from architecture.md
 * "Overlap-Berechnung (deterministisch)".
 *
 * @param {Array} ownEntities        — from claims.json
 * @param {Array} otherSessions      — from readOtherSessions()
 * @returns {Array<{ file, our_entity, their_entity, their_issue, their_feature, their_user, overlap_type, severity }>}
 */
function calculateOverlaps(ownEntities, otherSessions) {
  const overlaps = [];

  for (const ownEntity of ownEntities) {
    for (const otherSession of otherSessions) {
      for (const theirEntity of (otherSession.entities_changed || [])) {
        if (ownEntity.file === theirEntity.file) {
          let overlap_type;
          let severity;

          // AC-4: same file AND same non-null entity → high
          if (
            ownEntity.entity === theirEntity.entity &&
            ownEntity.entity !== null
          ) {
            overlap_type = 'same_entity';
            severity = 'high';
          } else {
            // AC-5: same file, different entity (or null entity)
            overlap_type = 'same_file_different_entity';
            severity = 'low';
          }

          overlaps.push({
            file: ownEntity.file,
            our_entity: ownEntity.entity,
            their_entity: theirEntity.entity,
            their_issue: otherSession.issueNumber,
            their_feature: otherSession.feature,
            their_user: otherSession.user || '',
            overlap_type,
            severity,
          });
        }
      }
    }
  }

  return overlaps;
}

// ---------------------------------------------------------------------------
// MODULE 6: Report Writer
// ---------------------------------------------------------------------------

/**
 * Compute overlap-specific summary fields.
 *
 * @param {Array} overlaps
 * @returns {{ overlapping_files: number, overlapping_entities: number, max_severity: string }}
 */
function buildOverlapSummary(overlaps) {
  if (overlaps.length === 0) {
    return { overlapping_files: 0, overlapping_entities: 0, max_severity: 'none' };
  }

  const overlappingFiles = new Set(overlaps.map((o) => o.file));
  const overlappingEntities = new Set(
    overlaps.map((o) => `${o.file}:${o.our_entity}`).filter((k) => !k.endsWith(':null'))
  );

  const hasHigh = overlaps.some((o) => o.severity === 'high');
  const maxSeverity = hasHigh ? 'high' : 'low';

  return {
    overlapping_files: overlappingFiles.size,
    overlapping_entities: overlappingEntities.size,
    max_severity: maxSeverity,
  };
}

/**
 * Parse weave-cli preview output into a weave_validation object.
 * Returns null if weave output is unavailable or unparseable.
 *
 * @param {string|null} weaveOutput
 * @returns {{ auto_resolvable: boolean, conflict_entities: string[], confidence: string }|null}
 */
function parseWeaveValidation(weaveOutput) {
  if (!weaveOutput || weaveOutput.trim().length === 0) return null;

  const conflictEntities = [];
  let hasConflicts = false;

  for (const line of weaveOutput.split('\n')) {
    // Look for conflict markers in weave output
    const conflictMatch = line.match(/conflict[:\s]+([A-Za-z_][A-Za-z0-9_]*)/i);
    if (conflictMatch) {
      hasConflicts = true;
      conflictEntities.push(conflictMatch[1]);
    }
  }

  const auto_resolvable = !hasConflicts;

  // Confidence heuristic based on output length and structure
  let confidence = 'low';
  const lineCount = weaveOutput.split('\n').filter((l) => l.trim().length > 0).length;
  if (lineCount > 10) confidence = 'high';
  else if (lineCount > 3) confidence = 'medium';

  return {
    auto_resolvable,
    conflict_entities: conflictEntities,
    confidence,
  };
}

/**
 * Write overlap-report.json to the spec-path directory.
 *
 * @param {string} specPath
 * @param {string} sessionId
 * @param {string} feature
 * @param {string} branch
 * @param {string} scanTimestamp
 * @param {Array}  entitiesChanged      — from claims.json (without isNewFile)
 * @param {Object} claimsSummary        — { files_changed, entities_changed, new_files }
 * @param {Array}  overlaps
 * @param {string|null} weaveOutput     — raw weave-cli preview output or null
 * @returns {string}  — path to the written file
 */
function writeReport(
  specPath,
  sessionId,
  feature,
  branch,
  scanTimestamp,
  entitiesChanged,
  claimsSummary,
  overlaps,
  weaveOutput
) {
  const overlapSummary = buildOverlapSummary(overlaps);
  const weaveValidation = parseWeaveValidation(weaveOutput);

  const report = {
    session_id: sessionId,
    feature,
    branch,
    scan_timestamp: scanTimestamp,
    entities_changed: entitiesChanged,
    overlaps,
    weave_validation: weaveValidation,
    summary: {
      files_changed: claimsSummary.files_changed,
      entities_changed: claimsSummary.entities_changed,
      new_files: claimsSummary.new_files,
      overlapping_files: overlapSummary.overlapping_files,
      overlapping_entities: overlapSummary.overlapping_entities,
      max_severity: overlapSummary.max_severity,
    },
  };

  const reportPath = path.join(specPath, 'overlap-report.json');
  try {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  } catch (err) {
    process.stderr.write(`Error writing overlap-report.json: ${err.message}\n`);
    process.exit(2);
  }

  return reportPath;
}

// ---------------------------------------------------------------------------
// MODULE 7: Exit Handler
// ---------------------------------------------------------------------------

/**
 * Write a JSON summary to stdout and exit with the appropriate code.
 *
 * @param {string} reportPath
 * @param {number} ownIssueNumber
 * @param {Array}  overlaps
 * @param {Object} summary
 */
function exitWithResult(reportPath, ownIssueNumber, overlaps, summary) {
  const exitCode = overlaps.length > 0 ? 1 : 0;

  const output = {
    status: exitCode === 0 ? 'no_overlaps' : 'overlaps_found',
    overlap_report_path: reportPath,
    own_issue_number: ownIssueNumber,
    summary,
  };

  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  process.exit(exitCode);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  // Step 1: Parse and validate CLI args
  const { branch, specPath, specPathRelative, repo, useWeave } = parseArgs();

  const sessionId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const feature = featureFromBranch(branch);

  // Step 2: Extract entities (optionally using weave-cli).
  // weave-cli is invoked AT MOST ONCE: runWeavePreview() returns both the raw
  // output (for weave_validation) and the parsed entities in a single call.
  let weaveOutput = null;
  let entities = null;

  if (useWeave) {
    const { rawOutput, entities: weaveEntities } = runWeavePreview();
    weaveOutput = rawOutput;   // may be null if weave-cli was unavailable
    entities = weaveEntities;  // null triggers git diff fallback below
  }

  if (entities === null) {
    const diffOutput = runGitDiff(branch);
    entities = parseDiffHunks(diffOutput);
  }

  // Apply Top-50 cap (GitHub Issue Body Limit)
  if (entities.length > 50) {
    entities = entities.slice(0, 50);
  }

  // Step 3: Write claims.json
  const claimsPath = writeClaims(specPath, entities);
  const claimsSummary = buildSummary(entities);

  // Strip internal isNewFile flag for output
  const entitiesForOutput = entities.map(({ isNewFile: _dropped, ...rest }) => rest);

  // Step 4: Session Registry — authenticate, create issue, read other sessions
  const scanTimestamp = new Date().toISOString();

  const claims = {
    entities_changed: entitiesForOutput,
    summary: claimsSummary,
  };

  const { ownIssueNumber, otherSessions } = registerSession(
    repo,
    sessionId,
    feature,
    branch,
    specPathRelative,  // relative path only — never expose absolute fs paths in public issues
    startedAt,
    claims
  );

  // Step 5: Overlap Calculator
  const overlaps = calculateOverlaps(entitiesForOutput, otherSessions);

  // Step 6: Report Writer
  const reportPath = writeReport(
    specPath,
    sessionId,
    feature,
    branch,
    scanTimestamp,
    entitiesForOutput,
    claimsSummary,
    overlaps,
    weaveOutput
  );

  // Step 7: Exit Handler
  exitWithResult(reportPath, ownIssueNumber, overlaps, {
    ...claimsSummary,
    overlapping_files: buildOverlapSummary(overlaps).overlapping_files,
    overlapping_entities: buildOverlapSummary(overlaps).overlapping_entities,
    max_severity: buildOverlapSummary(overlaps).max_severity,
  });
}

main();
