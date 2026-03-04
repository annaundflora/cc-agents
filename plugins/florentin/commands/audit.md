---
name: audit
description: "Startet die 7-Schichten Codebase-Analyse. Orchestriert alle Analyse-Agents und erstellt die Refactoring-Roadmap."
---

Starte die vollstaendige 7-Schichten Codebase-Analyse fuer das Laravel-Projekt (C:\work\repos\Laravel-2.0).

## Ziel
Erstelle eine datengetriebene, priorisierte Refactoring-Roadmap basierend auf:
- Quantitativen Metriken (LOC, Complexity, Churn)
- Architektur-Analyse (Dependencies, Coupling, Layer-Violations)
- Business-Impact (Revenue, User-Facing, Integrations)
- Test-Sicherheit (Coverage, Qualitaet)

## Ausfuehrung: 7 Schichten

### Schicht 0: BASELINE
Nutze den `baseline-scanner` Agent:
- Test-Suite Status auswerten
- LOC/Klassen/Methoden Statistik
- God Objects identifizieren (>500 LOC)
- Type-Safety Adoption messen
- Tool-Readiness pruefen (Larastan, Rector, Pint)
→ Speichere Ergebnis in `reports/00-baseline.md`

### Schicht 1: ARCHITEKTUR & DEPENDENCIES
Nutze den `dependency-mapper` Agent:
- Cross-Context Dependency Map
- Layer-Violations finden
- Zirkulaere Abhaengigkeiten aufdecken
- Coupling-Metriken berechnen (Ca, Ce, Instability)
- Event/Observer Ketten dokumentieren
→ Speichere Ergebnis in `reports/01-dependencies.md`

### Schicht 2: GIT FORENSICS
Nutze den `git-historian` Agent:
- Change-Frequenz Top 20
- Churn-Analyse (Lines Changed)
- Hotspot-Score (Complexity x Churn)
- Temporal Coupling (Co-Changes)
- Knowledge Distribution (Bus Factor)
→ Speichere Ergebnis in `reports/02-git-history.md`

### Schicht 3: TEST COVERAGE
Nutze den `test-coverage-auditor` Agent:
- Test-Inventar (Feature vs Unit)
- Coverage nach Domain
- Ungetestete Klassen identifizieren
- Test-Qualitaet bewerten
- Refactoring-Risiko-Matrix
→ Speichere Ergebnis in `reports/03-test-coverage.md`

### Schicht 4: ROUTE TRACES
Nutze den `route-tracer` Agent:
- Route-Inventar (API vs Web)
- Controller-Map mit Layer-Violations
- Kritische Business-Traces
- Middleware-Analyse
- API-Versioning Status
→ Speichere Ergebnis in `reports/04-route-traces.md`

### Schicht 5: BUSINESS CRITICALITY
Nutze den `business-criticality` Agent:
- Domain-Inventar
- Business-Impact Scoring
- Revenue/User-Facing Bewertung
- Externe Integrationen kartieren
- Do-Not-Touch Liste
→ Speichere Ergebnis in `reports/05-business-criticality.md`

### Schicht 6: SYNTHESE
Nutze den `report-synthesizer` Agent:
- Alle 6 Reports einlesen
- Multi-Dimensional Scoring
- Quadranten-Analyse (Impact x Debt)
- Abhaengigkeits-basierte Reihenfolge
- Konkrete Roadmap mit Sprints
→ Speichere Ergebnis in `reports/06-roadmap.md`

## Parallelisierung

Starte Schicht 0-5 parallel (sie sind unabhaengig voneinander):
```
[baseline-scanner]      ─┐
[dependency-mapper]     ─┤
[git-historian]         ─┼─→ Warte auf alle → [report-synthesizer]
[test-coverage-auditor] ─┤
[route-tracer]          ─┤
[business-criticality]  ─┘
```

## Validierung
Nach der Synthese:
1. Pruefe ob alle 6 Input-Reports vorhanden sind
2. Pruefe ob die Roadmap konsistent ist mit den Daten
3. Identifiziere Widersprueche zwischen Reports
4. Stelle sicher, dass JEDES Q1-Modul einen konkreten Aktionsplan hat

## Output
Am Ende praesentiere dem User:
1. **Executive Summary** (3-5 Saetze)
2. **Top 5 Erkenntnisse** (ueberraschende Findings)
3. **Roadmap-Vorschau** (Sprint 1 Detail, Sprint 2-3 Uebersicht)
4. **Naechster Schritt:** `/discovery {modul}` fuer das Top-Prioritaets-Modul
