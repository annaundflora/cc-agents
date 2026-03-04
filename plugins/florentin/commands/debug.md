---
name: debug
description: "Systematisches Debugging nach 5-Phasen-Methodik. Reproduzieren, Isolieren, Analysieren, Fixen, Verifizieren."
---

Debugge das Problem: $ARGUMENTS

Arbeitsverzeichnis: C:\work\repos\Laravel-2.0

## 5-Phasen Debugging

### Phase 1: REPRODUZIEREN
- Wie tritt das Problem auf? (Route, Command, Job, Test?)
- Error Message / Stack Trace analysieren
- Minimalen Reproduktionsfall erstellen
- `sail artisan test --filter=RelevantTest` ausfuehren

### Phase 2: ISOLIEREN
- Stack Trace von oben nach unten durchgehen
- Betroffene Datei(en) identifizieren
- Letzte Aenderungen pruefen: `git log --oneline -20`
- `git diff` fuer uncommitted Changes

### Phase 3: ANALYSIEREN
- Code der betroffenen Methode(n) lesen
- Datenfluss nachvollziehen (Input -> Processing -> Output)
- Abhaengigkeiten pruefen (Services, Models, Events)
- MongoDB Queries pruefen (richtige Collection? richtige Filter?)
- Environment pruefen: `sail artisan tinker` fuer Live-Tests

### Phase 4: FIXEN
- Minimalen Fix implementieren (kein Over-Engineering)
- Backward Compatibility beachten
- `vendor/bin/pint --dirty` ausfuehren

### Phase 5: VERIFIZIEREN
- Reproduktionsfall erneut testen
- `sail artisan test --parallel` – keine Regressions
- Edge Cases pruefen
- Fix dokumentieren (was war das Problem, warum dieser Fix)

## Regeln
- IMMER Code lesen, nie raten
- MINIMALER Fix – kein Refactoring waehrend Debugging
- Tests schreiben die den Bug abdecken (Regression Prevention)
- Wenn nach 3 Versuchen nicht geloest: Eskalation mit Report
