---
description: "Manueller Conflict-Scan: Entity-Overlap-Analyse gegen parallele Pipeline-Sessions via GitHub Issues. Führt conflict-scanner.js aus und triggert bei Overlap den Conflict-Reporter."
---

Führe einen **manuellen Conflict-Scan** durch.

## Voraussetzungen prüfen

Prüfe zuerst:

1. `gh auth status` — GitHub CLI muss authentifiziert sein
2. `git status` — Muss in einem Git-Repository sein
3. Aktueller Branch muss bekannt sein (`git branch --show-current`)

Wenn eine Voraussetzung fehlt, brich mit einer klaren Fehlermeldung ab.

## Parameter bestimmen

Bestimme die drei Pflicht-Parameter für das Script. Nutze `$ARGUMENTS` wenn vorhanden, sonst ermittle automatisch:

| Parameter | Aus $ARGUMENTS | Automatisch ermitteln |
|-----------|---------------|----------------------|
| `--branch` | Erstes Argument oder `--branch X` | `git branch --show-current` |
| `--spec-path` | `--spec-path X` | Suche nach `specs/*/architecture.md` oder `specs/*/.orchestrator-state.json` passend zum Branch-Namen |
| `--repo` | `--repo X` | `gh repo view --json nameWithOwner -q .nameWithOwner` |
| `--base` | `--base X` | Auto-Detection: origin HEAD, dann `main`, dann `master` (optional) |
| `--weave` | `--weave` Flag | Nicht gesetzt (optional) |

Wenn `--spec-path` nicht automatisch ermittelt werden kann, frage den User.

## Scan ausführen

```
plugin_path = "${CLAUDE_PLUGIN_ROOT}"
scan_result = Bash("node {plugin_path}/scripts/conflict-scanner.js --branch {branch} --spec-path {spec_path} --repo {repo} [--weave]")
```

## Ergebnis auswerten

### Exit Code 0 — Kein Overlap

```
OUTPUT: "Conflict-Scan abgeschlossen: Keine Überschneidungen mit anderen Sessions gefunden."
```

Zeige zusätzlich die Zusammenfassung aus stdout (files_changed, entities_changed, Issue-Nummer).

### Exit Code 1 — Overlap gefunden

```
OUTPUT: "Overlap gefunden! Starte Conflict-Reporter..."

overlap_report_path = "{spec_path}/overlap-report.json"
own_issue_number = parse_issue_number_from_stdout(scan_result.stdout)

reporter_result = Agent(
  subagent_type: "conflict-reporter",
  prompt: "overlap_report_path: {overlap_report_path}, own_issue_number: {own_issue_number}, repo: {repo}"
)
reporter_json = parse_agent_json(reporter_result)

IF reporter_json.status == "completed":
  OUTPUT: "Conflict-Reporter hat {len(reporter_json.issues_commented)} Issues kommentiert: {reporter_json.issues_commented}"
  OUTPUT: reporter_json.notes
ELSE:
  OUTPUT: "Warning: Conflict-Reporter fehlgeschlagen: {reporter_json.notes}"
```

### Exit Code 2 — Fehler

```
OUTPUT: "Conflict-Scan fehlgeschlagen: {scan_result.stderr}"
OUTPUT: "Prüfe: gh auth status, git status, Parameter-Werte."
```

## Label setzen (optional)

Wenn ein Issue erstellt wurde (Exit 0 oder 1) und der User es wünscht:

```
gh issue edit {own_issue_number} --repo {repo} --remove-label "pipeline:running" --add-label "pipeline:merge-ready"
```

Frage den User, ob das Label gesetzt werden soll — im manuellen Modus nicht automatisch setzen.

## Zusammenfassung

Zeige am Ende eine kompakte Zusammenfassung:

| Feld | Wert |
|------|------|
| Branch | `{branch}` |
| Spec-Path | `{spec_path}` |
| Repo | `{repo}` |
| Exit Code | `{scan_exit_code}` |
| Overlaps | Anzahl oder "keine" |
| Issue | `#{own_issue_number}` oder "keins erstellt" |
| Reporter | "erfolgreich" / "nicht nötig" / "fehlgeschlagen" |
