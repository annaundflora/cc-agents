# Slice 5: Conflict-Reporter Sub-Agent

> **Slice 5 von 5** für `conflict-aware-pipeline`

---

## Metadata (für Orchestrator)

| Key | Value |
|-----|-------|
| **ID** | `slice-05-conflict-reporter-sub-agent` |
| **Test** | Manuell: Agent-Definition reviewen gegen Checkliste |
| **E2E** | `false` |
| **Dependencies** | `["slice-03-conflict-scanner-github-registry-overlap-report"]` |

---

## Test-Strategy (für Orchestrator Pipeline)

| Key | Value |
|-----|-------|
| **Stack** | `markdown-agent-definition` |
| **Test Command** | Manuell: Pflichtfelder-Checkliste gegen Agent-Datei |
| **Integration Command** | `n/a` |
| **Acceptance Command** | Manuell: `Task(conflict-reporter)` mit Mock-`overlap-report.json` starten, Output gegen JSON-Schema prüfen |
| **Start Command** | `n/a` |
| **Health Endpoint** | `n/a` |
| **Mocking Strategy** | `mock_external` — Mock-`overlap-report.json` als Fixture für manuelle Acceptance-Tests |

---

## Ziel

Erstellt die Agent-Definition `conflict-reporter.md` als neues Claude-Code-Sub-Agent-Plugin. Der Agent liest `overlap-report.json`, formuliert einen menschenlesbaren GitHub-Issue-Comment mit Kontext-Analyse und Empfehlung, postet ihn via `gh issue comment` in beide betroffenen Issues mit @mention und gibt ein definiertes JSON-Output-Objekt zurück.

---

## Acceptance Criteria

1) GIVEN `conflict-reporter.md` existiert in `plugins/clemens/agents/`
   WHEN der Implementer die Datei manuell reviewt
   THEN enthält die Agent-Definition alle vier Pflichtblöcke: Task-Context-Anweisung (`overlap-report.json` lesen via `Read` Tool), Comment-Format-Spezifikation (Tabelle + Kontext-Abschnitt + Empfehlung), Bash-Aufruf-Anweisungen für `gh issue comment` in beide Issues, JSON-Output-Schema

2) GIVEN der Agent via `Task()` mit einem Prompt aufgerufen wird, der `overlap_report_path`, `own_issue_number` und `repo` enthält
   WHEN der Agent `overlap-report.json` liest und die Daten verarbeitet
   THEN liest er die Datei via `Read`-Tool am angegebenen Pfad und extrahiert `overlaps[]`, `summary`, `weave_validation` und `feature` aus dem JSON — ohne Fallback auf externe Quellen

3) GIVEN `overlap-report.json` enthält mindestens einen Overlap mit `severity: "high"`
   WHEN der Agent den Issue-Comment formuliert
   THEN enthält der Comment eine Markdown-Tabelle mit den Spalten `Datei`, `Entity`, `Diese Session`, `Konflikt mit`, `Andere Session` sowie einen `**Kontext:**`-Abschnitt und einen `**Empfehlung:**`-Abschnitt — Format: architecture.md → Section "LLM-Reporter Issue-Comment Format"

4) GIVEN `weave_validation.auto_resolvable` ist `false` oder `weave_validation` ist `null`
   WHEN der Agent die Empfehlung formuliert
   THEN enthält die Empfehlung explizit den Hinweis auf manuellen Review (`"Manueller Review empfohlen"`) und den Hinweis, dass Weave diese Entity nicht automatisch mergen kann

5) GIVEN `weave_validation.auto_resolvable` ist `true` (Overlaps haben `severity: "low"`)
   WHEN der Agent die Empfehlung formuliert
   THEN enthält die Empfehlung `"Weave löst automatisch"` oder gleichwertige Formulierung und KEINE Eskalations-Aufforderung

6) GIVEN `own_issue_number` und alle `overlaps[].their_issue`-Nummern sind bekannt
   WHEN der Agent `gh issue comment` aufruft
   THEN führt er via `Bash`-Tool mindestens zwei Aufrufe aus: einen für `own_issue_number` und je einen für jede eindeutige `their_issue`-Nummer — beide mit `--repo {repo}` und identischem Comment-Body, der `@{their_user}` enthält

7) GIVEN alle `gh issue comment`-Aufrufe sind abgeschlossen
   WHEN der Agent das Ergebnis zurückgibt
   THEN ist der Output ein valides JSON-Objekt mit genau diesen Feldern: `status` (`"completed"` oder `"failed"`), `commented` (Boolean), `issues_commented` (Integer-Array mit allen kommentierten Issue-Nummern), `notes` (String mit Zusammenfassung) — Schema: architecture.md → Section "Sub-Agent Task() Contract"

8) GIVEN ein `gh issue comment`-Aufruf schlägt fehl (gh nicht verfügbar oder Auth-Fehler)
   WHEN der Agent den Fehler erhält
   THEN setzt der Agent `status: "failed"` und `commented: false` im Output-JSON und loggt die Fehlerursache in `notes` — er bricht NICHT ab ohne Output zu liefern

---

## Test Skeletons

> **Für den Test-Writer-Agent:** Stack `markdown-agent-definition`. Verification via manuelle Checkliste und Acceptance-Test mit Mock-Daten. Kein automatisiertes Test-Framework.

### Checkliste: `plugins/clemens/agents/conflict-reporter.md`

<test_spec>
```markdown
## Strukturelle Vollständigkeit (AC-1)
- [ ] AC-1: Pflichtblock "Task-Context" vorhanden — Anweisung: overlap-report.json via Read-Tool lesen
- [ ] AC-1: Pflichtblock "Comment-Format" vorhanden — Tabelle + Kontext + Empfehlung spezifiziert
- [ ] AC-1: Pflichtblock "gh issue comment Aufrufe" vorhanden — beide Issues adressiert
- [ ] AC-1: Pflichtblock "JSON-Output-Schema" vorhanden — alle 4 Felder definiert (status, commented, issues_commented, notes)

## Input-Verarbeitung (AC-2)
- [ ] AC-2: Agent liest overlap_report_path via Read-Tool (kein Bash cat)
- [ ] AC-2: Agent extrahiert overlaps[], summary, weave_validation, feature aus dem JSON

## Comment-Format (AC-3, AC-4, AC-5)
- [ ] AC-3: Comment enthält Markdown-Tabelle mit Spalten: Datei, Entity, Diese Session, Konflikt mit, Andere Session
- [ ] AC-3: Comment enthält **Kontext:**-Abschnitt
- [ ] AC-3: Comment enthält **Empfehlung:**-Abschnitt
- [ ] AC-4: Bei weave_validation.auto_resolvable=false → "Manueller Review empfohlen" in Empfehlung
- [ ] AC-5: Bei weave_validation.auto_resolvable=true → "Weave löst automatisch" in Empfehlung, keine Eskalation

## gh-Aufrufe (AC-6)
- [ ] AC-6: Agent ruft gh issue comment für own_issue_number auf
- [ ] AC-6: Agent ruft gh issue comment für jede their_issue-Nummer auf
- [ ] AC-6: Comment-Body enthält @{their_user} Mention

## JSON-Output (AC-7, AC-8)
- [ ] AC-7: Output enthält genau: status, commented, issues_commented, notes
- [ ] AC-7: issues_commented ist Integer-Array mit allen kommentierten Nummern
- [ ] AC-8: Bei gh-Fehler: status="failed", commented=false, notes enthält Fehlerursache
```
</test_spec>

---

## Integration Contract

### Requires From Other Slices

| Slice | Resource | Type | Validation |
|-------|----------|------|------------|
| `slice-03-conflict-scanner-github-registry-overlap-report` | `{spec-path}/overlap-report.json` | JSON-Datei | Valides JSON mit `overlaps[]`, `summary`, `weave_validation`, `feature`, `branch` |
| `slice-03-conflict-scanner-github-registry-overlap-report` | GitHub Issue (erstellt) | Remote State | Issue-Nummern in `overlaps[].their_issue` und `own_issue_number` im Prompt |

### Provides To Other Slices

| Resource | Type | Consumer | Interface |
|----------|------|----------|-----------|
| `plugins/clemens/agents/conflict-reporter.md` | Agent-Definition | Slice 4 (Orchestrator Integration) | `Task("conflict-reporter", { overlap_report_path, own_issue_number, repo })` → `{ status, commented, issues_commented, notes }` |

---

## Deliverables (SCOPE SAFEGUARD)

<!-- DELIVERABLES_START -->
- [ ] `plugins/clemens/agents/conflict-reporter.md` — Sub-Agent-Definition: System-Prompt mit Task-Context, Comment-Format-Spezifikation, gh-Aufruf-Anweisungen und JSON-Output-Schema
<!-- DELIVERABLES_END -->

> **Hinweis:** Test-Dateien gehören NICHT in Deliverables. Der Test-Writer-Agent erstellt Tests basierend auf den Test Skeletons oben.

---

## Constraints

**Scope-Grenzen:**
- Kein `gh issue edit` / Label-Wechsel — gehört zu Slice 4 (Orchestrator)
- Kein Berechnen von Overlaps — deterministisch im Script (Slice 3), Agent nur für menschenlesbare Comments
- Kein Schreiben von `overlap-report.json` — Agent liest nur, schreibt nicht
- Keine Entscheidung über Merge-Reihenfolge — nur Empfehlung formulieren

**Technische Constraints:**
- Agent nutzt `Read`-Tool für JSON-Lesen (nicht `Bash cat`)
- Agent nutzt `Bash`-Tool für `gh issue comment`-Aufrufe
- Comment-Format exakt nach architecture.md → Section "LLM-Reporter Issue-Comment Format"
- JSON-Output exakt nach architecture.md → Section "Sub-Agent Task() Contract" (Output-Felder)
- Bei `weave_validation: null` → Empfehlung ohne Weave-spezifische Aussagen
- Agent läuft NUR bei Exit-Code 1 des Scripts (~2% der Fälle)

**Referenzen:**
- Architecture: `specs/2026-03-08-conflict-aware-pipeline/architecture.md` → Section "LLM-Reporter Issue-Comment Format" (Comment-Struktur)
- Architecture: `specs/2026-03-08-conflict-aware-pipeline/architecture.md` → Section "Sub-Agent Task() Contract" (Input + Output-Schema)
- Architecture: `specs/2026-03-08-conflict-aware-pipeline/architecture.md` → Section "GitHub Issue API (via gh CLI)" (exakte gh-Befehle)
- Architecture: `specs/2026-03-08-conflict-aware-pipeline/architecture.md` → Section "Error Handling Strategy" (Reporter Agent failed)
