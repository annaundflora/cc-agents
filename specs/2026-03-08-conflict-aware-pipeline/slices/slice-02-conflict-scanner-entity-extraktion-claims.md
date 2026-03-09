# Slice 2: Conflict-Scanner — Entity-Extraktion & Claims

> **Slice 2 von 4** für `conflict-aware-pipeline`

---

## Metadata (für Orchestrator)

| Key | Value |
|-----|-------|
| **ID** | `slice-02-conflict-scanner-entity-extraktion-claims` |
| **Test** | `node plugins/clemens/scripts/conflict-scanner.js --branch feature/test --spec-path /tmp/test-spec --repo owner/repo` |
| **E2E** | `false` |
| **Dependencies** | `[]` |

---

## Test-Strategy (für Orchestrator Pipeline)

> **Quelle:** Kein package.json im Repo — spec/agent-only Repository. Deliverable ist ein Node.js Script ohne Test-Framework. Verifikation via manuellen Script-Aufruf mit bekanntem Input/Output.

| Key | Value |
|-----|-------|
| **Stack** | `node-script-no-framework` |
| **Test Command** | `node plugins/clemens/scripts/conflict-scanner.js --branch feature/test --spec-path /tmp/test-spec --repo owner/repo` |
| **Integration Command** | `n/a` |
| **Acceptance Command** | Manuell: Script aufrufen, `claims.json` gegen Schema prüfen, Exit-Codes verifizieren |
| **Start Command** | `n/a` |
| **Health Endpoint** | `n/a` |
| **Mocking Strategy** | `mock_external` — `git diff` und `weave-cli` via Fixture-Dateien mocken |

---

## Ziel

Implementiert `conflict-scanner.js` bis zur `claims.json`-Schreibung — das heisst: CLI-Args parsen und validieren, `git diff`-Hunk-Header parsen um geaenderte Entities zu extrahieren (optional `weave-cli preview` nutzen), und das Ergebnis als valide `claims.json` in den `--spec-path` schreiben. GitHub-Interaktion und Overlap-Berechnung sind explizit ausgeschlossen — diese Scope-Grenze macht den Slice isoliert testbar.

---

## Acceptance Criteria

1) GIVEN `--branch`, `--spec-path` und `--repo` fehlen alle
   WHEN `node conflict-scanner.js` ohne Argumente aufgerufen wird
   THEN terminiert das Script mit Exit-Code `2` und schreibt eine Fehlermeldung auf `stderr` die alle fehlenden Pflicht-Argumente nennt

2) GIVEN `--branch` hat keinen Wert ODER `--repo` hat nicht das Format `owner/repo` ODER `--spec-path` existiert nicht als Verzeichnis
   WHEN das Script startet
   THEN terminiert es mit Exit-Code `2` und einer spezifischen Fehlermeldung auf `stderr` (z.B. `"Invalid repo format: expected owner/repo"`) — kein leeres `claims.json` wird geschrieben

3) GIVEN ein valider `git diff main...{branch}` Output mit Hunk-Headern die Entity-Namen enthalten (z.B. `@@ -42,10 +42,15 @@ function PromptArea() {`)
   WHEN das Script ohne `--weave` Flag läuft
   THEN wird `claims.json` in `--spec-path` geschrieben mit `entities_changed[]`-Einträgen die `entity`, `entity_type`, `file`, `lines [start, end]` und `diff_summary` korrekt befüllt haben — Entity-Typ-Heuristik gemäss architecture.md → Section "Entity Extraction Strategy"

4) GIVEN ein Hunk-Header ohne erkennbares Entity-Pattern (z.B. `@@ -10,5 +10,5 @@` ohne funcname)
   WHEN das Script den Diff parst
   THEN enthält der zugehörige Eintrag `entity: null` und `entity_type: "unknown"` — das Script terminiert NICHT mit Fehler

5) GIVEN alle Hunks einer Datei sind Additions (`+`) und die Datei existiert nicht in `main` (neue Datei)
   WHEN das Script den Diff parst
   THEN enthält der Eintrag `entity: null` und `entity_type: "new_file"` — `summary.new_files` wird um 1 erhöht

6) GIVEN ein valider Lauf ohne Fehler
   WHEN `claims.json` geschrieben wird
   THEN ist das JSON valide (parsebar), enthält `entities_changed` (Array), `summary.files_changed` (Integer >= 0), `summary.entities_changed` (Integer >= 0) und `summary.new_files` (Integer >= 0) — Schema-Detail: architecture.md → Section "Schema Details: claims.json"

7) GIVEN `--weave` Flag ist gesetzt UND `weave-cli` ist im PATH verfügbar
   WHEN das Script `weave-cli preview main` aufruft
   THEN wird der Text-Output geparst und als primäre Entity-Extraktion genutzt statt git diff — `claims.json` reflektiert Weave-Analyse

8) GIVEN `--weave` Flag ist gesetzt ABER `weave-cli` ist NICHT im PATH verfügbar
   WHEN das Script `weave-cli preview main` aufrufen versucht
   THEN fällt es auf `git diff` Hunk-Header-Parsing zurück — kein Exit-Code `2`, eine Warnung wird auf `stderr` ausgegeben

---

## Test Skeletons

> **Für den Test-Writer-Agent:** Stack `node-script-no-framework`. Test-Writer erstellt einen minimalen Test-Runner (z.B. `conflict-scanner.test.js`) mit Node.js Built-ins — kein npm erforderlich.

### Test-Datei: `plugins/clemens/scripts/conflict-scanner.test.js`

<test_spec>
```js
describe('conflict-scanner CLI', () => {
  // AC-1
  it.todo('should exit with code 2 and write all missing args to stderr when called without arguments')

  // AC-2
  it.todo('should exit with code 2 and stderr "Invalid repo format" when --repo has no slash')
  it.todo('should exit with code 2 and stderr "Spec path not found" when --spec-path does not exist')

  // AC-3
  it.todo('should extract entity "Foo" with entity_type "function" from hunk header containing "function Foo()"')
  it.todo('should extract entity "Bar" with entity_type "class" from hunk header containing "class Bar {"')
  it.todo('should populate lines[] with integer [start, end] tuple from hunk range')

  // AC-4
  it.todo('should produce entity: null and entity_type: "unknown" for hunk header without funcname, without exiting with error')

  // AC-5
  it.todo('should produce entity: null and entity_type: "new_file" for a newly added file')
  it.todo('should increment summary.new_files for each new file detected')

  // AC-6
  it.todo('should write parseable JSON to claims.json with all required top-level fields')

  // AC-7
  it.todo('should use weave-cli output as primary entity source when --weave flag is set and weave-cli is in PATH')

  // AC-8
  it.todo('should fall back to git diff parsing with exit code 0 and a stderr warning when --weave is set but weave-cli is not in PATH')
})
```
</test_spec>

---

## Integration Contract

### Requires From Other Slices

| Slice | Resource | Type | Validation |
|-------|----------|------|------------|
| — | Keine Dependencies | — | — |

### Provides To Other Slices

| Resource | Type | Consumer | Interface |
|----------|------|----------|-----------|
| `plugins/clemens/scripts/conflict-scanner.js` | CLI Script | Slice 4 (Orchestrator) | `node conflict-scanner.js --branch {str} --spec-path {path} --repo {owner/repo} [--weave]` → writes `{spec-path}/claims.json`, Exit 0/1/2 |
| `{spec-path}/claims.json` | JSON-Datei | Slice 3 (Reporter), Slice 4 | Schema: architecture.md → Section "Schema Details: claims.json" |

---

## Deliverables (SCOPE SAFEGUARD)

<!-- DELIVERABLES_START -->
- [ ] `plugins/clemens/scripts/conflict-scanner.js` — Enthält Module: CLI Parser (Args parsen + validieren), Entity Extractor (git diff Hunk-Header-Parsing + optionaler Weave-CLI-Aufruf), Claims Writer (claims.json in --spec-path schreiben)
<!-- DELIVERABLES_END -->

> **Hinweis:** Test-Dateien gehören NICHT in Deliverables. Der Test-Writer-Agent erstellt Tests basierend auf den Test Skeletons oben.

---

## Constraints

**Scope-Grenzen:**
- Kein `gh issue create` / `gh issue list` — GitHub-Interaktion gehört zu Slice 4
- Keine Overlap-Berechnung — gehört zu Slice 4
- Kein `overlap-report.json` — wird in Slice 4 geschrieben
- Exit-Code `1` (Overlap gefunden) wird in diesem Slice NICHT ausgelöst — nur `0` (Erfolg) und `2` (Fehler)

**Technische Constraints:**
- Nur Node.js Built-ins: `child_process`, `fs`, `path`, `crypto` — kein `npm install`, kein `package.json`
- Cross-Platform: `path.join()` statt String-Concatenation für Pfade (Win/Mac/Linux)
- `git diff` Befehl: `git diff main...{branch} --unified=0` — nur Hunk-Header parsen, keinen Diff-Content speichern
- Shell-Escape bei `gh`/`git`/`weave` Aufrufen via `child_process.execSync` — keine User-Input-Interpolation ohne Escaping
- Maximale Entities in `claims.json`: Top-50 wenn > 50 Entities (GitHub Issue Body Limit, architecture.md → Risks)

**Referenzen:**
- Architecture: `specs/2026-03-08-conflict-aware-pipeline/architecture.md` → Section "Entity Extraction Strategy" (Hunk-Header-Pattern-Tabelle, Entity-Typ-Heuristik)
- Architecture: `specs/2026-03-08-conflict-aware-pipeline/architecture.md` → Section "Schema Details: claims.json" (Pflichtfelder + Typen)
- Architecture: `specs/2026-03-08-conflict-aware-pipeline/architecture.md` → Section "Validation Rules" (CLI-Arg-Validierung + Exit-Code-Semantik)
- Architecture: `specs/2026-03-08-conflict-aware-pipeline/architecture.md` → Section "Constraints & Integrations: Constraints" (Zero npm Dependencies, Cross-Platform)
