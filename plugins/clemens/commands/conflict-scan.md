---
description: "Manueller Conflict-Scan: Entity-Overlap-Analyse gegen parallele Pipeline-Sessions via GitHub Issues. Ruft conflict-scanner Sub-Agent auf und triggert bei Overlap den Conflict-Reporter."
---

Fuehre einen **manuellen Conflict-Scan** durch.

## Voraussetzungen pruefen

Pruefe zuerst:

1. `gh auth status` — GitHub CLI muss authentifiziert sein
2. `git status` — Muss in einem Git-Repository sein
3. Aktueller Branch muss bekannt sein (`git branch --show-current`)

Wenn eine Voraussetzung fehlt, brich mit einer klaren Fehlermeldung ab.

## Parameter bestimmen

Bestimme die Parameter fuer den Scanner-Agent. Nutze `$ARGUMENTS` wenn vorhanden, sonst ermittle automatisch:

| Parameter | Aus $ARGUMENTS | Automatisch ermitteln |
|-----------|---------------|----------------------|
| `branch` | Erstes Argument oder `--branch X` | `git branch --show-current` |
| `spec_path` | `--spec-path X` | Suche nach `specs/*/architecture.md` oder `specs/*/.orchestrator-state.json` passend zum Branch-Namen |
| `repo` | `--repo X` | `gh repo view --json nameWithOwner -q .nameWithOwner` |
| `issue_number` | `--issue X` | Suche nach `pipeline:running` Issue fuer diesen Branch: `gh issue list --repo {repo} --label pipeline:running --json number,title --limit 100` |

Wenn `spec_path` nicht automatisch ermittelt werden kann, frage den User.

## Scan ausfuehren

```
scanner_result = Task("conflict-scanner", {
  mode: "actual",
  branch: branch,
  spec_path: spec_path,
  repo: repo,
  issue_number: issue_number
})
scanner_json = parse_agent_json(scanner_result)
```

## Ergebnis auswerten

### Kein Overlap (has_overlap == false)

```
OUTPUT: "Conflict-Scan abgeschlossen: Keine Ueberschneidungen mit anderen Sessions gefunden."
OUTPUT: scanner_json.notes
```

### Overlap gefunden (has_overlap == true)

```
OUTPUT: "Overlap gefunden! Starte Conflict-Reporter..."

reporter_result = Agent(
  subagent_type: "conflict-reporter",
  prompt: "overlap_report_path: {spec_path}/overlap-report.json, own_issue_number: {issue_number}, repo: {repo}"
)
reporter_json = parse_agent_json(reporter_result)

IF reporter_json.status == "completed":
  OUTPUT: "Conflict-Reporter hat {len(reporter_json.issues_commented)} Issues kommentiert: {reporter_json.issues_commented}"
  OUTPUT: reporter_json.notes
ELSE:
  OUTPUT: "Warning: Conflict-Reporter fehlgeschlagen: {reporter_json.notes}"
```

### Fehler (status == "failed")

```
OUTPUT: "Conflict-Scan fehlgeschlagen: {scanner_json.notes}"
OUTPUT: "Pruefe: gh auth status, git status, Parameter-Werte."
```

## Label setzen (optional)

Wenn ein Issue existiert und der User es wuenscht:

```
gh issue edit {issue_number} --repo {repo} --remove-label "pipeline:running" --add-label "pipeline:merge-ready"
```

Frage den User, ob das Label gesetzt werden soll — im manuellen Modus nicht automatisch setzen.

## Zusammenfassung

Zeige am Ende eine kompakte Zusammenfassung:

| Feld | Wert |
|------|------|
| Branch | `{branch}` |
| Spec-Path | `{spec_path}` |
| Repo | `{repo}` |
| Overlaps | Anzahl oder "keine" |
| Issue | `#{issue_number}` oder "keins" |
| Reporter | "erfolgreich" / "nicht noetig" / "fehlgeschlagen" |
