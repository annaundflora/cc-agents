# Slice 7: Script-Verzeichnis Plugin-Registration

> **Slice 7 von 7** für `conflict-aware-pipeline`

---

## Metadata (für Orchestrator)

| Key | Value |
|-----|-------|
| **ID** | `slice-07-script-verzeichnis-plugin-registration` |
| **Test** | `node -e "const p = require('./plugins/clemens/.claude-plugin/plugin.json'); if (!p.scripts) process.exit(1)"` |
| **E2E** | `false` |
| **Dependencies** | `["slice-02-conflict-scanner-entity-extraktion-claims"]` |

---

## Test-Strategy (für Orchestrator Pipeline)

> **Quelle:** Kein package.json im Repo — spec/agent-only Repository. Deliverable ist eine JSON-Manifest-Änderung. Verifikation via JSON-Parse-Check.

| Key | Value |
|-----|-------|
| **Stack** | `node-script-no-framework` |
| **Test Command** | `node -e "const p = require('./plugins/clemens/.claude-plugin/plugin.json'); if (!p.scripts) process.exit(1)"` |
| **Integration Command** | `n/a` |
| **Acceptance Command** | Manuell: JSON parsen, `scripts`-Key prüfen, alle bestehenden Keys verifizieren |
| **Start Command** | `n/a` |
| **Health Endpoint** | `n/a` |
| **Mocking Strategy** | `no_mocks` — direkte Datei-Verifikation |

---

## Ziel

Registriert das neue `scripts/`-Verzeichnis im Plugin-Manifest, indem `plugin.json` um einen `scripts`-Key mit dem Pfad zu `conflict-scanner.js` ergänzt wird. Damit ist das Script als offizielles Plugin-Artifact deklariert und wird bei Distribution korrekt mitgeliefert.

---

## Acceptance Criteria

1) GIVEN `plugin.json` enthält aktuell die Keys `name`, `description`, `version` und `author`
   WHEN die Datei um den `scripts`-Key ergänzt wird
   THEN bleiben alle vier bestehenden Keys mit ihren exakten Werten unverändert erhalten — kein Key fehlt, kein Wert wird verändert

2) GIVEN die aktualisierte `plugin.json`
   WHEN `JSON.parse()` auf den Datei-Inhalt angewendet wird
   THEN wirft der Parse-Call keine Exception — die Datei ist valides JSON

3) GIVEN die aktualisierte `plugin.json`
   WHEN der `scripts`-Key ausgelesen wird
   THEN enthält er mindestens einen Eintrag mit dem Pfad `scripts/conflict-scanner.js` (relativer Pfad zum Plugin-Root)

4) GIVEN Slice 2 hat `plugins/clemens/scripts/conflict-scanner.js` als Deliverable
   WHEN der Pfad im `scripts`-Key mit dem tatsächlichen Dateipfad des Deliverables verglichen wird
   THEN stimmt der relative Pfad überein — kein Tipp-Fehler, kein falsches Verzeichnis

---

## Test Skeletons

> **Für den Test-Writer-Agent:** Stack `node-script-no-framework` — Test-Skeletons als `it.todo()` ohne Framework. Test-Writer implementiert Checks via Node.js built-ins.

### Test-Datei: `plugins/clemens/.claude-plugin/plugin.json.test.js`

<test_spec>
```js
// AC-1
it.todo('should keep all existing keys (name, description, version, author) unchanged')

// AC-2
it.todo('should contain valid JSON that parses without exception')

// AC-3
it.todo('should have a scripts key with an entry for scripts/conflict-scanner.js')

// AC-4
it.todo('should reference a path that matches the actual conflict-scanner.js deliverable from Slice 2')
```
</test_spec>

---

## Integration Contract

### Requires From Other Slices

| Slice | Resource | Type | Validation |
|-------|----------|------|------------|
| `slice-02-conflict-scanner-entity-extraktion-claims` | `plugins/clemens/scripts/conflict-scanner.js` | CLI Script | Pfad muss mit dem `scripts`-Eintrag in `plugin.json` übereinstimmen (AC-4) |

### Provides To Other Slices

| Resource | Type | Consumer | Interface |
|----------|------|----------|-----------|
| `plugins/clemens/.claude-plugin/plugin.json` | JSON-Manifest | Plugin-Distribution | `{ scripts: ["scripts/conflict-scanner.js"] }` — ergänzt bestehende Struktur |

---

## Deliverables (SCOPE SAFEGUARD)

<!-- DELIVERABLES_START -->
- [ ] `plugins/clemens/.claude-plugin/plugin.json` — Ergänzt um `scripts`-Key mit Pfad-Eintrag für `conflict-scanner.js`; alle bestehenden Keys (`name`, `description`, `version`, `author`) bleiben unverändert
<!-- DELIVERABLES_END -->

> **Hinweis:** Test-Dateien gehören NICHT in Deliverables. Der Test-Writer-Agent erstellt Tests basierend auf den Test Skeletons oben.

---

## Constraints

**Scope-Grenzen:**
- Keine Änderung an bestehenden Keys — `name`, `description`, `version`, `author` bleiben exakt wie in der aktuellen Datei
- Kein Hinzufügen anderer neuer Keys (z.B. `agents`, `commands`, `templates`) — nur `scripts`
- Kein Anlegen von Verzeichnissen oder anderen Dateien — reine Manifest-Änderung
- Keine Erhöhung der `version`-Nummer — gehört nicht zu diesem Slice

**Technische Constraints:**
- JSON muss nach der Änderung ohne externe Tools parsebar sein (Node.js built-in `JSON.parse`)
- Relative Pfade im `scripts`-Array sind relativ zum Plugin-Root `plugins/clemens/`
- Einrückung und Formatierung soll konsistent mit dem bestehenden Datei-Stil bleiben (2-Space-Indent)

**Referenzen:**
- Architecture: `specs/2026-03-08-conflict-aware-pipeline/architecture.md` → Section "Constraints & Integrations: Constraints" (Plugin-Packaging-Constraint)
- Discovery: `specs/2026-03-08-conflict-aware-pipeline/discovery.md` → Section "Plugin-Packaging" (Ziel-Verzeichnisstruktur)
- Slice 2: `slices/slice-02-conflict-scanner-entity-extraktion-claims.md` → Deliverables (Pfad des Scripts)
