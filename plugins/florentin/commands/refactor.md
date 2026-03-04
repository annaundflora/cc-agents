---
name: refactor
description: Refactored eine Datei nach SOLID und Laravel Best Practices
---

Refactore $ARGUMENTS im Laravel-2.0 Projekt (C:\work\repos\Laravel-2.0):

## Vorgehen
1. **Analysiere** die Datei und identifiziere Verantwortlichkeiten
2. **Plane** die Aufteilung (zeige den Plan BEVOR du umsetzt)
3. **Extrahiere** Code in neue Klassen/Services/Concerns
4. **Behalte** Backward Compatibility (alte Methoden als Wrapper)
5. **Aktualisiere** oder schreibe Tests
6. **Lasse Tests laufen**: `sail artisan test --filter=RelevantTest`
7. **Formatiere**: `vendor/bin/pint --dirty`

## Regeln
- MongoDB-Modelle extenden BaseModel
- Bestehende DDD-Patterns respektieren
- Action Classes für single-responsibility Operationen
- Service Classes für Orchestrierung
- Contracts/Interfaces für Abstraktion
