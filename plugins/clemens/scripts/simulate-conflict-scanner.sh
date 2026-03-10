#!/usr/bin/env bash
#
# simulate-conflict-scanner.sh
#
# Simuliert den Conflict Scanner in allen Ausprägungen:
#
#   Szenario 1: CLI-Fehler (Exit 2) — fehlende Args, ungültiges Repo-Format, fehlender Spec-Path
#   Szenario 2: Kein Overlap (Exit 0) — Branch mit Änderungen, keine andere Session
#   Szenario 3: Overlap HIGH (Exit 1) — Fake-Issue claimt dieselbe Entity
#   Szenario 4: Overlap LOW (Exit 1) — Fake-Issue claimt andere Entity in selber Datei
#   Szenario 5: Korruptes Issue (Exit 0) — Fake-Issue mit kaputter JSON-Body wird übersprungen
#   Szenario 6: --weave Fallback (Exit 0) — weave-cli nicht installiert, Fallback auf git diff
#
# Voraussetzungen:
#   - git, node, gh (authentifiziert)
#   - Aktuelles Verzeichnis ist Repo-Root von cc-agents
#
# Cleanup: Das Script räumt am Ende ALLES auf (Branches, Issues, Temp-Dateien).
#          Bei Ctrl+C greift ein Trap.
#
# Usage: bash plugins/clemens/scripts/simulate-conflict-scanner.sh
#
set -uo pipefail
# Kein set -e: Wir prüfen Exit Codes manuell über check(), nicht via Bash Auto-Abort

# ============================= Config ========================================
SCANNER="plugins/clemens/scripts/conflict-scanner.js"
REPO=""             # wird automatisch ermittelt
TEST_PREFIX="sim-conflict-test"
TEST_BRANCH="${TEST_PREFIX}/feature-alpha"
SPEC_DIR=""         # wird im Repo erstellt
CREATED_ISSUES=()   # für Cleanup
STASHED=false

# ============================= Colors ========================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

pass()  { echo -e "  ${GREEN}PASS${NC}  $1"; }
fail()  { echo -e "  ${RED}FAIL${NC}  $1"; FAILURES=$((FAILURES + 1)); }
info()  { echo -e "  ${CYAN}INFO${NC}  $1"; }
header(){ echo -e "\n${BOLD}${YELLOW}═══ $1 ═══${NC}\n"; }

FAILURES=0
TOTAL=0

check() {
  TOTAL=$((TOTAL + 1))
  local desc="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    pass "$desc"
  else
    fail "$desc"
  fi
}

# Grep-Wrapper für check: check_grep "desc" "pattern" "$variable"
check_grep() {
  TOTAL=$((TOTAL + 1))
  local desc="$1"
  local pattern="$2"
  local text="$3"
  if echo "$text" | grep -qi "$pattern" 2>/dev/null; then
    pass "$desc"
  else
    fail "$desc"
  fi
}

# Node-Eval Wrapper: liest Datei und gibt Ergebnis zurück
node_read() {
  local file="$1"
  local expr="$2"
  node -e "const r=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log($expr)" "$file" 2>/dev/null
}

# JSON aus gemischtem stdout/stderr extrahieren
extract_json() {
  local text="$1"
  node -e "
    const d = process.argv[1];
    const start = d.indexOf('{');
    if (start < 0) { process.exit(0); }
    let depth = 0;
    for (let i = start; i < d.length; i++) {
      if (d[i] === '{') depth++;
      else if (d[i] === '}') depth--;
      if (depth === 0) { console.log(d.substring(start, i + 1)); break; }
    }
  " "$text" 2>/dev/null || true
}

# Issue-Nummer aus Scanner-JSON extrahieren und in CREATED_ISSUES speichern
track_issue() {
  local output="$1"
  local json
  json=$(extract_json "$output")
  if [[ -n "$json" ]]; then
    local num
    num=$(node -e "try{console.log(JSON.parse(process.argv[1]).own_issue_number||0)}catch(e){console.log(0)}" "$json" 2>/dev/null || echo "0")
    if [[ "${num:-0}" -gt 0 ]]; then
      CREATED_ISSUES+=("$num")
      info "Issue erstellt: #$num"
    fi
    echo "$num"
  else
    echo "0"
  fi
}

# ============================= Cleanup =======================================
cleanup() {
  header "CLEANUP"

  # Issues schließen
  for issue_num in "${CREATED_ISSUES[@]}"; do
    if [[ -n "$issue_num" && "$issue_num" != "0" ]]; then
      info "Schließe Issue #${issue_num}..."
      gh issue close "$issue_num" --repo "$REPO" 2>/dev/null || true
    fi
  done

  # Test-Branch löschen (lokal)
  if git show-ref --verify --quiet "refs/heads/${TEST_BRANCH}" 2>/dev/null; then
    info "Lösche lokalen Branch ${TEST_BRANCH}..."
    git checkout main 2>/dev/null || true
    git branch -D "$TEST_BRANCH" 2>/dev/null || true
  else
    git checkout main 2>/dev/null || true
  fi

  # Test-Branch löschen (remote)
  if git ls-remote --heads origin "$TEST_BRANCH" 2>/dev/null | grep -q .; then
    info "Lösche Remote-Branch ${TEST_BRANCH}..."
    git push origin --delete "$TEST_BRANCH" 2>/dev/null || true
  fi

  # Test-Dateien aus src/ löschen und Base-Commit rückgängig machen
  if [[ -d "src/components" ]]; then
    rm -rf src/components src/services
    # Base-Commit auf main rückgängig machen (letzten Commit entfernen)
    if git log -1 --pretty=%s | grep -q "conflict scanner simulation"; then
      info "Base-Commit auf main rückgängig machen..."
      git reset --hard HEAD~1 2>/dev/null || true
    fi
    info "Test-Dateien src/ gelöscht"
  fi

  # Spec-Dir löschen
  if [[ -n "$SPEC_DIR" && -d "$SPEC_DIR" ]]; then
    info "Lösche Spec-Dir ${SPEC_DIR}..."
    rm -rf "$SPEC_DIR"
  fi

  # Stash wiederherstellen
  if [[ "$STASHED" == "true" ]]; then
    info "Stash wiederherstellen..."
    git stash pop 2>/dev/null || true
  fi

  echo ""
  if [[ $FAILURES -eq 0 ]]; then
    echo -e "${GREEN}${BOLD}════════════════════════════════════════${NC}"
    echo -e "${GREEN}${BOLD}  ALLE $TOTAL CHECKS BESTANDEN${NC}"
    echo -e "${GREEN}${BOLD}════════════════════════════════════════${NC}"
  else
    echo -e "${RED}${BOLD}════════════════════════════════════════${NC}"
    echo -e "${RED}${BOLD}  $FAILURES von $TOTAL CHECKS FEHLGESCHLAGEN${NC}"
    echo -e "${RED}${BOLD}════════════════════════════════════════${NC}"
  fi
}

trap cleanup EXIT

# ============================= Voraussetzungen ===============================
header "VORAUSSETZUNGEN"

# Node
if ! command -v node &>/dev/null; then
  echo "FEHLER: node nicht gefunden" >&2; exit 1
fi
info "Node $(node --version)"

# Git
if ! command -v git &>/dev/null; then
  echo "FEHLER: git nicht gefunden" >&2; exit 1
fi
info "Git $(git --version | cut -d' ' -f3)"

# gh CLI
if ! command -v gh &>/dev/null; then
  echo "FEHLER: gh CLI nicht gefunden" >&2; exit 1
fi
info "gh $(gh --version | head -1)"

# gh Auth — GITHUB_TOKEN entfernen, damit Keyring-Auth geprüft wird
unset GITHUB_TOKEN 2>/dev/null || true
if ! gh auth status 2>&1 | grep -q "Logged in"; then
  echo "FEHLER: gh nicht authentifiziert. Bitte 'gh auth login' ausführen." >&2
  exit 1
fi
info "gh authentifiziert"

# Repo ermitteln
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
info "Repo: $REPO"

# Scanner existiert
if [[ ! -f "$SCANNER" ]]; then
  echo "FEHLER: $SCANNER nicht gefunden" >&2; exit 1
fi
info "Scanner: $SCANNER"

# Sicherstellen: auf main, ggf. stashen
git checkout main 2>/dev/null
if [[ -n "$(git status --porcelain)" ]]; then
  info "Working Tree nicht clean — stashe Änderungen..."
  git stash push -m "simulate-conflict-scanner auto-stash" --include-untracked
  STASHED=true
fi
info "Working Tree clean, auf main"

# Spec-Dir im Repo erstellen (damit Pfade auf Windows konsistent sind)
SPEC_DIR="$(pwd)/.sim-test-spec"
rm -rf "$SPEC_DIR"
mkdir -p "$SPEC_DIR"
info "Spec-Dir: $SPEC_DIR"

# Alte pipeline:running Issues aufräumen (von abgebrochenen Läufen)
info "Räume alte pipeline:running Issues auf..."
old_issues=$(gh issue list --repo "$REPO" --label "pipeline:running" --json number -q '.[].number' 2>/dev/null || true)
for old_num in $old_issues; do
  gh issue close "$old_num" --repo "$REPO" 2>/dev/null || true
  gh issue edit "$old_num" --repo "$REPO" --remove-label "pipeline:running" 2>/dev/null || true
  info "Altes Issue #$old_num geschlossen"
done


# =============================================================================
#  SZENARIO 1: CLI-Fehler (Exit 2)
# =============================================================================
header "SZENARIO 1: CLI-Fehler (Exit 2)"

# 1a: Keine Argumente
info "1a: Ohne Argumente aufrufen..."

output=$(node "$SCANNER" 2>&1)
exit_code=$?

check "Ohne Args → Exit 2" [ "$exit_code" -eq 2 ]
check_grep "Ohne Args → stderr nennt fehlende Args" "missing required" "$output"

# 1b: Ungültiges Repo-Format
info "1b: Ungültiges Repo-Format..."

output=$(node "$SCANNER" --branch test --spec-path "$SPEC_DIR" --repo "kein-slash" 2>&1)
exit_code=$?

check "Ungültiges Repo → Exit 2" [ "$exit_code" -eq 2 ]
check_grep "Ungültiges Repo → stderr nennt owner/repo" "expected owner/repo" "$output"

# 1c: Nicht-existierender Spec-Path
info "1c: Nicht-existierender Spec-Path..."

output=$(node "$SCANNER" --branch test --spec-path "./does-not-exist-xyz" --repo "owner/repo" 2>&1)
exit_code=$?

check "Spec-Path fehlt → Exit 2" [ "$exit_code" -eq 2 ]
check_grep "Spec-Path fehlt → stderr nennt 'not found'" "not found" "$output"


# =============================================================================
#  SETUP: Basis-Dateien auf main committen, dann auf Branch modifizieren
# =============================================================================
header "SETUP: Test-Branch erstellen"

# Schritt 1: Basis-Dateien auf main committen (damit der Diff ein MODIFY ist, kein NEW FILE)
mkdir -p src/components src/services

cat > src/components/PromptArea.tsx << 'TSXEOF'
import React from 'react';

export function PromptArea() {
  const [text, setText] = React.useState('');

  return (
    <div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} />
    </div>
  );
}

export function PromptToolbar() {
  return <div className="toolbar">Tools</div>;
}
TSXEOF

cat > src/services/UserService.ts << 'TSEOF'
export class UserService {
  async getUser(id: string) {
    return { id, name: 'Test User' };
  }
}
TSEOF

cat > src/services/helpers.ts << 'TSEOF'
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}
TSEOF

git add src/
git commit -m "test: add base source files for conflict scanner simulation"
info "Basis-Dateien auf main committed"

# Schritt 2: Feature-Branch erstellen und Dateien MODIFIZIEREN
git checkout -b "$TEST_BRANCH"
info "Branch erstellt: $TEST_BRANCH"

# PromptArea.tsx: handleSubmit hinzufügen (ändert die PromptArea-Funktion)
cat > src/components/PromptArea.tsx << 'TSXEOF'
import React from 'react';

export function PromptArea() {
  const [text, setText] = React.useState('');

  function handleSubmit() {
    console.log('submit', text);
  }

  return (
    <div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} />
      <button onClick={handleSubmit}>Send</button>
    </div>
  );
}

export function PromptToolbar() {
  return <div className="toolbar">Tools here</div>;
}
TSXEOF

# UserService.ts: updateUser hinzufügen (ändert die UserService-Klasse)
cat > src/services/UserService.ts << 'TSEOF'
export class UserService {
  async getUser(id: string) {
    return { id, name: 'Test User' };
  }

  async updateUser(id: string, data: Record<string, unknown>) {
    return { ...data, id };
  }
}
TSEOF

# helpers.ts: slugify hinzufügen (neue Funktion)
cat > src/services/helpers.ts << 'TSEOF'
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-');
}
TSEOF

git add src/
git commit -m "test: modify source files for conflict scanner simulation"

info "Test-Dateien modifiziert: PromptArea.tsx, UserService.ts, helpers.ts"

# Diff prüfen
diff_output=$(git diff main..."$TEST_BRANCH" --stat)
info "Diff gegen main:"
echo "$diff_output" | while read -r line; do info "  $line"; done

# Hunk-Headers prüfen (zeigt ob Entity-Erkennung funktionieren wird)
info "Hunk-Headers:"
git diff main..."$TEST_BRANCH" --unified=0 | grep "^@@" | while read -r line; do info "  $line"; done


# =============================================================================
#  SZENARIO 2: Kein Overlap (Exit 0) — keine andere Session
# =============================================================================
header "SZENARIO 2: Kein Overlap (Exit 0)"

info "Scanner laufen lassen — keine anderen pipeline:running Issues vorhanden..."

node "$SCANNER" --branch "$TEST_BRANCH" --spec-path "$SPEC_DIR" --repo "$REPO" \
  > "$SPEC_DIR/_stdout.txt" 2> "$SPEC_DIR/_stderr.txt"
exit_code=$?

output=$(cat "$SPEC_DIR/_stdout.txt" "$SPEC_DIR/_stderr.txt")

check "Exit Code 0 (kein Overlap)" [ "$exit_code" -eq 0 ]
check "claims.json wurde geschrieben" [ -f "$SPEC_DIR/claims.json" ]

if [[ -f "$SPEC_DIR/claims.json" ]]; then
  claims_valid=$(node_read "$SPEC_DIR/claims.json" "'valid'" 2>/dev/null || echo "invalid")
  check "claims.json ist valides JSON" [ "$claims_valid" = "valid" ]

  entities_count=$(node_read "$SPEC_DIR/claims.json" "r.entities_changed.length")
  check "claims.json enthält Entities (>0)" [ "${entities_count:-0}" -gt 0 ]
  info "Entities gefunden: $entities_count"

  has_prompt_area=$(node_read "$SPEC_DIR/claims.json" "r.entities_changed.some(e=>e.entity==='PromptArea')")
  check "Entity 'PromptArea' erkannt" [ "$has_prompt_area" = "true" ]

  has_user_service=$(node_read "$SPEC_DIR/claims.json" "r.entities_changed.some(e=>e.entity==='UserService')")
  check "Entity 'UserService' erkannt" [ "$has_user_service" = "true" ]

  has_function=$(node_read "$SPEC_DIR/claims.json" "r.entities_changed.some(e=>e.entity_type==='function')")
  check "Entity-Typ 'function' erkannt" [ "$has_function" = "true" ]

  has_class=$(node_read "$SPEC_DIR/claims.json" "r.entities_changed.some(e=>e.entity_type==='class')")
  check "Entity-Typ 'class' erkannt" [ "$has_class" = "true" ]

  info "claims.json Inhalt:"
  node -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')),null,2))" "$SPEC_DIR/claims.json" 2>/dev/null | head -40
fi

# Issue aus stdout extrahieren
own_issue=$(node -e "try{const d=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(d.own_issue_number||0)}catch(e){console.log(0)}" "$SPEC_DIR/_stdout.txt" 2>/dev/null || echo "0")
if [[ "${own_issue:-0}" -gt 0 ]]; then
  CREATED_ISSUES+=("$own_issue")
  info "Issue erstellt: #$own_issue"
fi
check "GitHub Issue wurde erstellt (Issue# > 0)" [ "${own_issue:-0}" -gt 0 ]

check "overlap-report.json wurde geschrieben" [ -f "$SPEC_DIR/overlap-report.json" ]

if [[ -f "$SPEC_DIR/overlap-report.json" ]]; then
  no_overlaps=$(node_read "$SPEC_DIR/overlap-report.json" "r.overlaps.length")
  check "Keine Overlaps im Report" [ "${no_overlaps:-1}" -eq 0 ]

  max_sev=$(node_read "$SPEC_DIR/overlap-report.json" "r.summary.max_severity")
  check "max_severity = 'none'" [ "$max_sev" = "none" ]
fi

# Eigenes Issue schließen + Label entfernen damit es folgende Szenarien nicht stört
if [[ "${own_issue:-0}" -gt 0 ]]; then
  gh issue close "$own_issue" --repo "$REPO" 2>/dev/null || true
  gh issue edit "$own_issue" --repo "$REPO" --remove-label "pipeline:running" 2>/dev/null || true
  info "Eigenes Issue #$own_issue geschlossen"
fi

# Cleanup für nächstes Szenario
rm -f "$SPEC_DIR/claims.json" "$SPEC_DIR/overlap-report.json"


# =============================================================================
#  SZENARIO 3: Overlap HIGH (Exit 1) — Fake-Issue claimt PromptArea
# =============================================================================
header "SZENARIO 3: Overlap HIGH (Exit 1)"

info "Erstelle Fake-Issue das PromptArea in selber Datei claimt..."

FAKE_BODY_HIGH='## Session

```json
{
  "session_id": "fake-session-001",
  "feature": "workspace-redesign",
  "branch": "feature/workspace-redesign",
  "spec_path": "specs/fake-workspace",
  "started_at": "2026-03-10T10:00:00Z"
}
```

## Entity Claims

```json
{
  "entities_changed": [
    {
      "file": "src/components/PromptArea.tsx",
      "entity": "PromptArea",
      "entity_type": "function",
      "lines": [3, 18],
      "diff_summary": "+5 -3"
    },
    {
      "file": "src/utils/logger.ts",
      "entity": "createLogger",
      "entity_type": "function",
      "lines": [1, 20],
      "diff_summary": "+20 -0"
    }
  ],
  "summary": {
    "files_changed": 2,
    "entities_changed": 2,
    "new_files": 0
  }
}
```'

# Label erstellen falls nötig
gh label create "pipeline:running" --repo "$REPO" --color "FBCA04" --description "Pipeline session active" 2>/dev/null || true

fake_url_high=$(gh issue create \
  --repo "$REPO" \
  --title "Pipeline: workspace-redesign" \
  --label "pipeline:running" \
  --body "$FAKE_BODY_HIGH" 2>&1)
fake_issue_high=$(echo "$fake_url_high" | grep -oE '[0-9]+$' || echo "0")

if [[ "$fake_issue_high" -gt 0 ]]; then
  CREATED_ISSUES+=("$fake_issue_high")
  info "Fake-Issue HIGH erstellt: #$fake_issue_high"
  info "Warte 4s auf GitHub API Indexierung..."
  sleep 4
else
  fail "Konnte Fake-Issue nicht erstellen"
  TOTAL=$((TOTAL + 1))
  fake_issue_high=0
fi

info "Scanner laufen lassen — sollte Overlap mit PromptArea finden..."

node "$SCANNER" --branch "$TEST_BRANCH" --spec-path "$SPEC_DIR" --repo "$REPO" \
  > "$SPEC_DIR/_stdout.txt" 2> "$SPEC_DIR/_stderr.txt"
exit_code=$?


check "Exit Code 1 (Overlap gefunden)" [ "$exit_code" -eq 1 ]
check "overlap-report.json geschrieben" [ -f "$SPEC_DIR/overlap-report.json" ]

if [[ -f "$SPEC_DIR/overlap-report.json" ]]; then
  overlap_count=$(node_read "$SPEC_DIR/overlap-report.json" "r.overlaps.length")
  check "Mindestens 1 Overlap im Report" [ "${overlap_count:-0}" -gt 0 ]

  has_same_entity=$(node_read "$SPEC_DIR/overlap-report.json" "r.overlaps.some(o=>o.overlap_type==='same_entity')")
  check "Overlap-Typ 'same_entity' vorhanden" [ "$has_same_entity" = "true" ]

  has_high=$(node_read "$SPEC_DIR/overlap-report.json" "r.overlaps.some(o=>o.severity==='high')")
  check "Severity 'high' vorhanden" [ "$has_high" = "true" ]

  max_sev=$(node_read "$SPEC_DIR/overlap-report.json" "r.summary.max_severity")
  check "max_severity = 'high'" [ "$max_sev" = "high" ]

  has_fake_ref=$(node_read "$SPEC_DIR/overlap-report.json" "r.overlaps.some(o=>o.their_issue===${fake_issue_high})")
  check "their_issue verweist auf Fake-Issue #$fake_issue_high" [ "$has_fake_ref" = "true" ]

  info "Overlap-Report HIGH (Auszug):"
  node -e "const r=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(JSON.stringify({overlaps:r.overlaps,summary:r.summary},null,2))" "$SPEC_DIR/overlap-report.json" 2>/dev/null | head -50
fi

# Issue aus diesem Lauf tracken + schließen
own_issue_s3=$(node -e "try{const d=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(d.own_issue_number||0)}catch(e){console.log(0)}" "$SPEC_DIR/_stdout.txt" 2>/dev/null || echo "0")
if [[ "${own_issue_s3:-0}" -gt 0 ]]; then
  CREATED_ISSUES+=("$own_issue_s3")
  gh issue close "$own_issue_s3" --repo "$REPO" 2>/dev/null || true
  gh issue edit "$own_issue_s3" --repo "$REPO" --remove-label "pipeline:running" 2>/dev/null || true
fi

rm -f "$SPEC_DIR/claims.json" "$SPEC_DIR/overlap-report.json"


# =============================================================================
#  SZENARIO 4: Overlap LOW (Exit 1) — andere Entity in selber Datei
# =============================================================================
header "SZENARIO 4: Overlap LOW (Exit 1)"

# Schließe HIGH-Issue + Label entfernen damit es nicht stört
if [[ "$fake_issue_high" -gt 0 ]]; then
  gh issue close "$fake_issue_high" --repo "$REPO" 2>/dev/null || true
  gh issue edit "$fake_issue_high" --repo "$REPO" --remove-label "pipeline:running" 2>/dev/null || true
  info "High-Issue #$fake_issue_high geschlossen"
fi

info "Erstelle Fake-Issue mit anderer Entity in selber Datei..."

FAKE_BODY_LOW='## Session

```json
{
  "session_id": "fake-session-002",
  "feature": "prompt-refactor",
  "branch": "feature/prompt-refactor",
  "spec_path": "specs/fake-prompt",
  "started_at": "2026-03-10T11:00:00Z"
}
```

## Entity Claims

```json
{
  "entities_changed": [
    {
      "file": "src/components/PromptArea.tsx",
      "entity": "SomeOtherComponent",
      "entity_type": "function",
      "lines": [50, 80],
      "diff_summary": "+10 -5"
    }
  ],
  "summary": {
    "files_changed": 1,
    "entities_changed": 1,
    "new_files": 0
  }
}
```'

fake_url_low=$(gh issue create \
  --repo "$REPO" \
  --title "Pipeline: prompt-refactor" \
  --label "pipeline:running" \
  --body "$FAKE_BODY_LOW" 2>&1)
fake_issue_low=$(echo "$fake_url_low" | grep -oE '[0-9]+$' || echo "0")

if [[ "$fake_issue_low" -gt 0 ]]; then
  CREATED_ISSUES+=("$fake_issue_low")
  info "Fake-Issue LOW erstellt: #$fake_issue_low"
  info "Warte 4s auf GitHub API Indexierung..."
  sleep 4
fi

node "$SCANNER" --branch "$TEST_BRANCH" --spec-path "$SPEC_DIR" --repo "$REPO" \
  > "$SPEC_DIR/_stdout.txt" 2> "$SPEC_DIR/_stderr.txt"
exit_code=$?


check "Exit Code 1 (Overlap gefunden)" [ "$exit_code" -eq 1 ]

if [[ -f "$SPEC_DIR/overlap-report.json" ]]; then
  has_low=$(node_read "$SPEC_DIR/overlap-report.json" "r.overlaps.some(o=>o.severity==='low')")
  check "Severity 'low' vorhanden" [ "$has_low" = "true" ]

  has_same_file=$(node_read "$SPEC_DIR/overlap-report.json" "r.overlaps.some(o=>o.overlap_type==='same_file_different_entity')")
  check "Overlap-Typ 'same_file_different_entity' vorhanden" [ "$has_same_file" = "true" ]

  info "Overlap-Report LOW (Auszug):"
  node -e "const r=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(JSON.stringify(r.overlaps,null,2))" "$SPEC_DIR/overlap-report.json" 2>/dev/null | head -30
fi

own_issue_s4=$(node -e "try{const d=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(d.own_issue_number||0)}catch(e){console.log(0)}" "$SPEC_DIR/_stdout.txt" 2>/dev/null || echo "0")
if [[ "${own_issue_s4:-0}" -gt 0 ]]; then
  CREATED_ISSUES+=("$own_issue_s4")
  gh issue close "$own_issue_s4" --repo "$REPO" 2>/dev/null || true
  gh issue edit "$own_issue_s4" --repo "$REPO" --remove-label "pipeline:running" 2>/dev/null || true
fi

# Low-Issue schließen
if [[ "$fake_issue_low" -gt 0 ]]; then
  gh issue close "$fake_issue_low" --repo "$REPO" 2>/dev/null || true
  gh issue edit "$fake_issue_low" --repo "$REPO" --remove-label "pipeline:running" 2>/dev/null || true
fi

rm -f "$SPEC_DIR/claims.json" "$SPEC_DIR/overlap-report.json"


# =============================================================================
#  SZENARIO 5: Korruptes Issue (Exit 0) — Fake-Issue mit kaputter Body
# =============================================================================
header "SZENARIO 5: Korruptes Issue (Exit 0)"

info "Erstelle Fake-Issue mit kaputter JSON-Body..."

FAKE_BODY_CORRUPT='## Session

```json
{ this is not valid json !!!
```

## Entity Claims

```json
{ broken: [[[
```'

fake_url_corrupt=$(gh issue create \
  --repo "$REPO" \
  --title "Pipeline: corrupt-test" \
  --label "pipeline:running" \
  --body "$FAKE_BODY_CORRUPT" 2>&1)
fake_issue_corrupt=$(echo "$fake_url_corrupt" | grep -oE '[0-9]+$' || echo "0")

if [[ "$fake_issue_corrupt" -gt 0 ]]; then
  CREATED_ISSUES+=("$fake_issue_corrupt")
  info "Fake-Issue CORRUPT erstellt: #$fake_issue_corrupt"
  info "Warte 4s auf GitHub API Indexierung..."
  sleep 4
fi

node "$SCANNER" --branch "$TEST_BRANCH" --spec-path "$SPEC_DIR" --repo "$REPO" \
  > "$SPEC_DIR/_stdout.txt" 2> "$SPEC_DIR/_stderr.txt"
exit_code=$?

stderr_content=$(cat "$SPEC_DIR/_stderr.txt")

check "Exit Code 0 (korruptes Issue wird übersprungen)" [ "$exit_code" -eq 0 ]
check_grep "stderr enthält 'Skipping issue' Warnung" "skipping issue" "$stderr_content"

if [[ -f "$SPEC_DIR/overlap-report.json" ]]; then
  no_overlaps=$(node_read "$SPEC_DIR/overlap-report.json" "r.overlaps.length")
  check "Keine Overlaps (korruptes Issue ignoriert)" [ "${no_overlaps:-1}" -eq 0 ]
fi

own_issue_s5=$(node -e "try{const d=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(d.own_issue_number||0)}catch(e){console.log(0)}" "$SPEC_DIR/_stdout.txt" 2>/dev/null || echo "0")
if [[ "${own_issue_s5:-0}" -gt 0 ]]; then
  CREATED_ISSUES+=("$own_issue_s5")
  gh issue close "$own_issue_s5" --repo "$REPO" 2>/dev/null || true
  gh issue edit "$own_issue_s5" --repo "$REPO" --remove-label "pipeline:running" 2>/dev/null || true
fi

if [[ "$fake_issue_corrupt" -gt 0 ]]; then
  gh issue close "$fake_issue_corrupt" --repo "$REPO" 2>/dev/null || true
fi

rm -f "$SPEC_DIR/claims.json" "$SPEC_DIR/overlap-report.json"


# =============================================================================
#  SZENARIO 6: --weave Fallback (Exit 0) — weave-cli nicht installiert
# =============================================================================
header "SZENARIO 6: --weave Fallback (Exit 0)"

info "Scanner mit --weave aufrufen (weave-cli nicht installiert)..."


node "$SCANNER" --branch "$TEST_BRANCH" --spec-path "$SPEC_DIR" --repo "$REPO" --weave \
  > "$SPEC_DIR/_stdout.txt" 2> "$SPEC_DIR/_stderr.txt"
exit_code=$?

stderr_content=$(cat "$SPEC_DIR/_stderr.txt")

check "Exit Code 0 (Fallback auf git diff)" [ "$exit_code" -eq 0 ]
check_grep "stderr enthält 'weave-cli not available' Warnung" "weave-cli not available" "$stderr_content"
check "claims.json trotzdem geschrieben (Fallback)" [ -f "$SPEC_DIR/claims.json" ]

if [[ -f "$SPEC_DIR/overlap-report.json" ]]; then
  weave_null=$(node_read "$SPEC_DIR/overlap-report.json" "r.weave_validation")
  check "weave_validation = null (kein Weave verfügbar)" [ "$weave_null" = "null" ]
fi

own_issue_s6=$(node -e "try{const d=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(d.own_issue_number||0)}catch(e){console.log(0)}" "$SPEC_DIR/_stdout.txt" 2>/dev/null || echo "0")
if [[ "${own_issue_s6:-0}" -gt 0 ]]; then
  CREATED_ISSUES+=("$own_issue_s6")
  gh issue close "$own_issue_s6" --repo "$REPO" 2>/dev/null || true
  gh issue edit "$own_issue_s6" --repo "$REPO" --remove-label "pipeline:running" 2>/dev/null || true
fi

rm -f "$SPEC_DIR/claims.json" "$SPEC_DIR/overlap-report.json"


# =============================================================================
#  FERTIG — Cleanup passiert automatisch via trap
# =============================================================================
header "SIMULATION ABGESCHLOSSEN"
info "Cleanup wird automatisch ausgeführt..."
