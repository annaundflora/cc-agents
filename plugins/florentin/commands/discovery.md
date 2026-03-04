---
name: discovery
description: "Startet die Refactoring-Discovery fuer ein Laravel-Modul. Analysiert Code, plant Strategie, erstellt refactoring-spec.md."
---

Starte die Refactoring-Discovery fuer $ARGUMENTS im Laravel-Projekt (C:\work\repos\Laravel-2.0).

## Ablauf (5 Phasen – KEINE ueberspringen)

### Phase 0: Verstehen
- Was genau soll refactored werden?
- Was ist das Problem? (zu gross, zu komplex, Code Smells?)
- Was soll das Ergebnis sein?
- Stelle gezielte Fragen bis Problem, Scope und Ziel klar sind.

### Phase 1: Research
Nutze den `codebase-researcher` Agent parallel fuer:
1. Zieldatei komplett lesen (alle Methoden, Zeilen, Complexity)
2. Alle Aufrufer finden (Grep nach Klasse + Methoden)
3. Tests finden (tests/Feature/ und tests/Unit/)
4. Events/Listeners/Observers identifizieren
5. Routes und FormRequests pruefen

### Phase 2: Strategie
Basierend auf Research:
- **Strangler Fig** (bevorzugt): Alte Methoden als Wrapper, schrittweise Migration
- **Branch by Abstraction**: Interface einfuehren, neue Implementation dahinter
- **Direct Rewrite**: Nur bei isoliertem Code ohne Aufrufer

### Phase 3: Design
- Neue Klassen/Services/Actions definieren
- Interfaces/Contracts planen
- Methoden-Zuordnung (alt -> neu)
- Test-Strategie

### Phase 4: Spec schreiben
Output: `specs/{datum}-{modul-name}/refactoring-spec.md`
Mit ALLEN Required Sections (Problem, Scope, Ist/Soll, Strategie, Dependencies, Risiken, ACs, Tests, Reihenfolge).

## Regeln
- **Raten verboten** – Code LESEN, nicht annehmen
- **OFFEN/UNKLAR markieren** wenn etwas nicht gefunden wird
- **Bestehende Patterns respektieren** (DDD, Actions, Repositories)
- **Backward Compatibility** immer einplanen
