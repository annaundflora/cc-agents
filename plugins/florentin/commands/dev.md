---
name: dev
description: "Startet den 6-Phasen Dev-Orchestrator. Nimmt refactoring-spec.md und baut das komplette Refactoring."
---

Starte den Dev-Orchestrator fuer $ARGUMENTS.

## Eingangspruefung (BLOCKIEREND)
1. Existiert eine refactoring-spec.md? -> Ohne Spec wird NICHT gearbeitet.
2. Hat sie alle Required Sections? -> Fehlende melden.
3. Arbeitsverzeichnis: C:\work\repos\Laravel-2.0

## 6 Phasen

### Phase 1: SETUP
- Git Branch: `refactor/{modul-name}`
- Test-Baseline: `sail artisan test --parallel`
- Larastan-Baseline (wenn installiert)
- Betroffene Dateien identifizieren

### Phase 2: ARCHITEKTUR
- ACs auf Dateien mappen
- Interfaces/Contracts definieren
- **SCOPE CONFIRMATION** (zeige Plan, warte auf Bestaetigung)
- Nach Bestaetigung: SCOPE EINGEFROREN

### Phase 3: IMPLEMENTATION (pro AC)
Fuer JEDE AC:
1. Code schreiben/extrahieren
2. Backward Compatibility Wrapper
3. Mindestens 1 Test
4. Test PASS
5. `vendor/bin/pint --dirty`
6. COMMIT: `refactor({scope}): AC{x} – {beschreibung}`

### Phase 4: TESTS
- Alle existierenden Tests PASS
- Neue Unit Tests (Happy + Error Path)
- Feature Tests wenn Controller betroffen

### Phase 5: SELF-REVIEW
- architecture-guardian -> Fix -> Retry (max 3x)
- laravel-standards-guardian -> Fix -> Retry (max 3x)
- spec-compliance -> Fix -> Retry (max 3x)
- security-guardian -> Fix (CRITICAL/HIGH), dokumentieren (MEDIUM)
- 3x FAIL -> Eskalation an User

### Phase 6: FINALIZE
- Volle Test-Suite PASS
- Pint clean
- Vorher/Nachher Report
- Merge-Readiness Check
