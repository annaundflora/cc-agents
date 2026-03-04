---
name: finalize
description: "Abschluss-Check: Alle Tests gruen, Pint clean, Larastan, Vorher/Nachher Report, Merge-Readiness."
---

Finalisiere das Refactoring fuer $ARGUMENTS im Laravel-Projekt (C:\work\repos\Laravel-2.0).

## Finalisierungs-Checkliste

### 1. Test-Suite
```bash
sail artisan test --parallel
```
- [ ] 0 Failures
- [ ] Keine skipped Tests die vorher liefen
- [ ] Test-Count >= Baseline (nicht weniger Tests als vorher)

### 2. Code Style
```bash
vendor/bin/pint
```
- [ ] 0 Fixes noetig

### 3. Static Analysis (wenn installiert)
```bash
vendor/bin/phpstan analyse --level=0
```
- [ ] Fehler <= Baseline (nicht mehr Fehler als vorher)

### 4. Git Status
```bash
git status
git log --oneline -20
```
- [ ] Keine uncommitted Changes
- [ ] Alle ACs haben eigene Commits
- [ ] Branch ist up-to-date

### 5. Vorher/Nachher Report erstellen

```markdown
## Refactoring Report: {Modul}

### Metriken
| Metrik | Vorher | Nachher | Diff |
|--------|--------|---------|------|
| Zeilen (Hauptdatei) | X | Y | -Z |
| Methoden (Hauptdatei) | X | Y | -Z |
| Neue Klassen | - | X | +X |
| Tests | X | Y | +Z |
| Pint Issues | X | 0 | -X |

### Erstellte Dateien
- ...

### Geaenderte Dateien
- ...

### Deprecated Wrapper
| Methode | Neue Location | Aufrufer migriert? |
|---------|--------------|-------------------|

### Offene Punkte
- ...
```

### 6. Behavior Preservation Check (PFLICHT)
Fuehre den `behavior-preservation` Safeguard aus:
- [ ] Characterization Tests PASS
- [ ] Alle public Methoden gemappt (alt -> neu)
- [ ] Side-Effects erhalten (Observer, Events, Listeners)
- [ ] Return-Types kompatibel
- [ ] Parameter kompatibel
→ CRITICAL/HIGH Findings: SOFORT fixen vor Merge!

### 7. Merge-Readiness
- [ ] Alle ACs DONE
- [ ] Alle Tests PASS
- [ ] Code Style clean
- [ ] Behavior Preservation PASS
- [ ] Backward Compatibility gegeben
- [ ] Deprecated Wrapper dokumentiert
- [ ] Report erstellt

## Output
Erstelle `specs/{modul}/dev-finalize.md` mit dem kompletten Report.
