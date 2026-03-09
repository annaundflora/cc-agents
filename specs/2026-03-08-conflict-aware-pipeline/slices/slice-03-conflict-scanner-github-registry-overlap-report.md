# Slice 3: Conflict-Scanner — GitHub Registry, Overlap & Report

> **Slice 3 von 4** für `conflict-aware-pipeline`

---

## Metadata (für Orchestrator)

| Key | Value |
|-----|-------|
| **ID** | `slice-03-conflict-scanner-github-registry-overlap-report` |
| **Test** | `node plugins/clemens/scripts/conflict-scanner.js --branch feature/test --spec-path /tmp/test-spec --repo owner/repo` |
| **E2E** | `false` |
| **Dependencies** | `["slice-02-conflict-scanner-entity-extraktion-claims"]` |

---

## Test-Strategy (für Orchestrator Pipeline)

| Key | Value |
|-----|-------|
| **Stack** | `node-script-no-framework` |
| **Test Command** | `node plugins/clemens/scripts/conflict-scanner.js --branch feature/test --spec-path /tmp/test-spec --repo owner/repo` |
| **Integration Command** | `n/a` |
| **Acceptance Command** | Manuell: Script mit gemockten `gh`-Aufrufen aufrufen, `overlap-report.json` gegen Schema prüfen, Exit-Codes verifizieren |
| **Start Command** | `n/a` |
| **Health Endpoint** | `n/a` |
| **Mocking Strategy** | `mock_external` — `gh` via Umgebungsvariable oder Stub-Binary mocken |

---

## Ziel

Erweitert `conflict-scanner.js` um drei Module: Session Registry (GitHub Issue erstellen und andere Issues lesen), Overlap Calculator (deterministischer File+Entity-Vergleich nach Severity-Regeln) und Report Writer (`overlap-report.json` schreiben). Abschluss mit Exit-Code-Semantik (0/1/2), womit das Script vollständig lauffähig ist.

---

## Acceptance Criteria

1) GIVEN `gh` CLI ist nicht im PATH oder `gh auth status` schlägt fehl
   WHEN das Script nach dem Claims-Schreiben `gh issue create` aufrufen will
   THEN terminiert das Script mit Exit-Code `2` und schreibt `"GitHub CLI not authenticated"` auf `stderr` — `overlap-report.json` wird NICHT geschrieben

2) GIVEN ein valides `claims.json` wurde von Slice 2 geschrieben und `gh` ist authentifiziert
   WHEN das Script `gh issue create` aufruft
   THEN wird ein GitHub Issue mit Titel `"Pipeline: {feature}"`, Label `"pipeline:running"` und einem Body erstellt der zwei JSON-Blöcke enthält (`## Session` und `## Entity Claims`) — Format gemäss architecture.md → Section "Schema Details: GitHub Issue Body"

3) GIVEN `gh issue list --label pipeline:running` gibt N Issues zurück (N >= 0)
   WHEN das Script die Issue-Bodies parst
   THEN werden valide JSON-Blöcke aus `## Entity Claims` als andere Sessions erfasst — Issues mit ungültigem JSON werden mit einer `stderr`-Warnung `"Skipping issue #{n}: invalid JSON"` übersprungen, das Script terminiert NICHT mit Fehler

4) GIVEN zwei Sessions haben jeweils `entity: "PromptArea"` in `file: "components/prompt-area.tsx"`
   WHEN der Overlap Calculator läuft
   THEN enthält `overlaps[]` einen Eintrag mit `overlap_type: "same_entity"` und `severity: "high"` für diese Kombination

5) GIVEN zwei Sessions haben unterschiedliche Entities (`entity: "PromptArea"` vs `entity: "usePromptState"`) in derselben `file`
   WHEN der Overlap Calculator läuft
   THEN enthält `overlaps[]` einen Eintrag mit `overlap_type: "same_file_different_entity"` und `severity: "low"`

6) GIVEN der Overlap Calculator hat Overlaps berechnet (mind. 1 Eintrag mit `severity: "high"`)
   WHEN der Report Writer `overlap-report.json` schreibt
   THEN ist das JSON valide, enthält alle Pflichtfelder (`session_id`, `feature`, `branch`, `scan_timestamp`, `entities_changed[]`, `overlaps[]`, `weave_validation`, `summary`) mit `summary.max_severity: "high"` — Schema: architecture.md → Section "Schema Details: overlap-report.json"

7) GIVEN `overlap-report.json` wurde erfolgreich geschrieben und `overlaps[]` ist leer
   WHEN der Exit Handler läuft
   THEN terminiert das Script mit Exit-Code `0` und schreibt eine JSON-Zusammenfassung auf `stdout`

8) GIVEN `overlap-report.json` wurde erfolgreich geschrieben und `overlaps[]` enthält mind. 1 Eintrag
   WHEN der Exit Handler läuft
   THEN terminiert das Script mit Exit-Code `1` und schreibt eine JSON-Zusammenfassung auf `stdout`

9) GIVEN `--weave` Flag ist gesetzt und `weave-cli preview main` Output war verfügbar
   WHEN der Report Writer läuft
   THEN ist `weave_validation` ein Objekt mit `auto_resolvable` (Boolean), `conflict_entities` (Array) und `confidence` (`"high"/"medium"/"low"`) — wenn Weave nicht verfügbar war: `weave_validation: null`

---

## Test Skeletons

> **Für den Test-Writer-Agent:** Stack `node-script-no-framework`. Tests erweitern `conflict-scanner.test.js` aus Slice 2 — kein separates Test-File.

### Test-Datei: `plugins/clemens/scripts/conflict-scanner.test.js`

<test_spec>
```js
describe('Session Registry', () => {
  // AC-1
  it.todo('should exit with code 2 and stderr "GitHub CLI not authenticated" when gh is not in PATH')

  // AC-2
  it.todo('should call gh issue create with title "Pipeline: {feature}", label "pipeline:running" and a body containing ## Session and ## Entity Claims JSON blocks')

  // AC-3
  it.todo('should parse entity claims from valid issue bodies and add them as other sessions')
  it.todo('should skip issues with invalid JSON body and write stderr warning "Skipping issue #N: invalid JSON" without exiting')
})

describe('Overlap Calculator', () => {
  // AC-4
  it.todo('should produce overlap_type "same_entity" and severity "high" for two sessions sharing the same file and entity name')

  // AC-5
  it.todo('should produce overlap_type "same_file_different_entity" and severity "low" for two sessions sharing a file but different entity names')
})

describe('Report Writer', () => {
  // AC-6
  it.todo('should write parseable overlap-report.json with all required fields and summary.max_severity "high" when high-severity overlaps exist')

  // AC-9
  it.todo('should set weave_validation to an object with auto_resolvable, conflict_entities and confidence when --weave output was available')
  it.todo('should set weave_validation to null when weave-cli was not available')
})

describe('Exit Handler', () => {
  // AC-7
  it.todo('should exit with code 0 and write JSON summary to stdout when overlaps[] is empty')

  // AC-8
  it.todo('should exit with code 1 and write JSON summary to stdout when overlaps[] has at least one entry')
})
```
</test_spec>

---

## Integration Contract

### Requires From Other Slices

| Slice | Resource | Type | Validation |
|-------|----------|------|------------|
| `slice-02-conflict-scanner-entity-extraktion-claims` | `plugins/clemens/scripts/conflict-scanner.js` | CLI Script (Basis-Module) | Datei muss existieren mit CLI Parser, Entity Extractor und Claims Writer |
| `slice-02-conflict-scanner-entity-extraktion-claims` | `{spec-path}/claims.json` | JSON-Datei | Valides JSON mit `entities_changed[]` und `summary` |

### Provides To Other Slices

| Resource | Type | Consumer | Interface |
|----------|------|----------|-----------|
| `plugins/clemens/scripts/conflict-scanner.js` | CLI Script (vollständig) | Slice 4 (Orchestrator) | `node conflict-scanner.js --branch {str} --spec-path {path} --repo {owner/repo} [--weave]` → Exit 0/1/2, writes `overlap-report.json` |
| `{spec-path}/overlap-report.json` | JSON-Datei | Slice 4 (Orchestrator), conflict-reporter Agent | Schema: architecture.md → Section "Schema Details: overlap-report.json" |

---

## Deliverables (SCOPE SAFEGUARD)

<!-- DELIVERABLES_START -->
- [ ] `plugins/clemens/scripts/conflict-scanner.js` — Erweiterung um Module: Session Registry (gh issue create/list + JSON-Parsing), Overlap Calculator (deterministischer File+Entity-Vergleich), Report Writer (overlap-report.json), Exit Handler (0/1/2 mit stdout-Summary)
<!-- DELIVERABLES_END -->

> **Hinweis:** Test-Dateien gehören NICHT in Deliverables. Der Test-Writer-Agent erstellt Tests basierend auf den Test Skeletons oben.

---

## Constraints

**Scope-Grenzen:**
- Kein `gh issue edit` / Label-Wechsel — gehört zu Slice 4 (Orchestrator)
- Kein `gh issue comment` — gehört zum conflict-reporter Agent (Slice 4 via Task())
- `claims.json`-Schreibung wird NICHT wiederholt — bereits in Slice 2 implementiert

**Technische Constraints:**
- Nur Node.js Built-ins: `child_process`, `fs`, `path`, `crypto` — kein `npm install`
- `gh issue list` mit `--limit 100 --json number,title,body` — Output via `child_process.execSync` parsen
- GitHub Issue Body JSON-Parsing in `try/catch` — korrupte Issues überspringen, nicht abbrechen
- Shell-Escape für alle `gh`-Aufrufe — keine User-Input-Interpolation ohne Escaping
- `session_id` via `crypto.randomUUID()` generieren
- `scan_timestamp` als ISO 8601 String via `new Date().toISOString()`
- Overlap-Algorithmus exakt nach architecture.md → Section "Overlap-Berechnung (deterministisch)" implementieren
- `weave_validation: null` wenn `--weave` nicht gesetzt oder weave-cli nicht verfügbar war

**Referenzen:**
- Architecture: `specs/2026-03-08-conflict-aware-pipeline/architecture.md` → Section "Overlap-Berechnung (deterministisch)" (exakter Algorithmus)
- Architecture: `specs/2026-03-08-conflict-aware-pipeline/architecture.md` → Section "Schema Details: overlap-report.json" (Pflichtfelder + Typen)
- Architecture: `specs/2026-03-08-conflict-aware-pipeline/architecture.md` → Section "Schema Details: GitHub Issue Body" (Issue-Format)
- Architecture: `specs/2026-03-08-conflict-aware-pipeline/architecture.md` → Section "GitHub Issue API (via gh CLI)" (exakte gh-Befehle)
- Architecture: `specs/2026-03-08-conflict-aware-pipeline/architecture.md` → Section "Error Handling Strategy" (Exit-Code-Mapping)
