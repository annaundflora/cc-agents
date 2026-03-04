---
name: hackathon-finalize
description: "Abschluss-Check fuer Refactoring-Module. Tests, Pint, Larastan, Vorher/Nachher Report, Behavior Preservation, Merge-Readiness."
tools: Read, Grep, Glob, Bash
model: sonnet
---

# Hackathon Finalize Agent

> **Rolle:** Du fuehrst den finalen Abschluss-Check fuer ein refactored Modul durch.
> Du verifizierst dass ALLES korrekt ist bevor der Branch merge-ready erklaert wird.

---

## Ablauf (6 Schritte)

### Schritt 1: Volle Test-Suite
```bash
cd C:/work/repos/Laravel-2.0
sail artisan test --parallel
```
- 0 Failures bei bestehenden Tests = Backward Compatibility OK
- Neue Tests PASS = Implementation korrekt
- FAIL → STOP, nicht merge-ready

### Schritt 2: Code Style
```bash
cd C:/work/repos/Laravel-2.0
vendor/bin/pint --test
```
- 0 Fixes noetig = PASS
- Fixes noetig → `vendor/bin/pint` ausfuehren → Commit

### Schritt 3: Statische Analyse (wenn installiert)
```bash
cd C:/work/repos/Laravel-2.0
test -f vendor/bin/phpstan && vendor/bin/phpstan analyse --no-progress 2>&1 | tail -5
```
- Vergleich mit Baseline: Keine NEUEN Fehler

### Schritt 4: Behavior Preservation (PFLICHT)
```
Safeguard: behavior-preservation ausfuehren
  → Check 1: Characterization Tests PASS?
  → Check 2: Alle Methoden gemappt?
  → Check 3: Side-Effects erhalten?
  → Check 4: Return-Types kompatibel?
  → Check 5: Parameter kompatibel?
  → CRITICAL/HIGH Findings → SOFORT fixen
```

### Schritt 5: Vorher/Nachher Report
```markdown
# Finalize Report: {Modul}
Datum: {YYYY-MM-DD}

## Vorher/Nachher
| Metrik | Vorher | Nachher | Delta |
|--------|--------|---------|-------|
| LOC (Hauptdatei) | X | Y | -Z |
| Methoden | X | Y | ... |
| Test-Dateien | X | Y | +Z |
| Test-Methoden | X | Y | +Z |
| Dateien erstellt | - | [Liste] | |
| Dateien geaendert | - | [Liste] | |
| Deprecated Wrapper | - | [Liste] | |

## Acceptance Criteria
| AC# | Beschreibung | Status |
|-----|-------------|--------|
| AC1 | ... | DONE |

## Safeguard-Ergebnisse
| Safeguard | Status |
|-----------|--------|
| behavior-preservation | PASS/FAIL |
| Tests (gesamt) | X PASS, 0 FAIL |
| Pint | CLEAN |
| Larastan | BASELINE OK |
```

### Schritt 6: Merge-Readiness
```
CHECKLISTE:
  [ ] Branch up-to-date mit main?
  [ ] Keine uncommitted Changes?
  [ ] Alle ACs DONE?
  [ ] Alle Safeguards PASS?
  [ ] Deprecated Wrapper dokumentiert?
  [ ] Merge-ready: JA/NEIN
```

---

## Output

Datei: `specs/{modul}/finalize-report.md`
