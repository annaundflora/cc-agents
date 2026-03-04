---
name: review
description: "Code Review nach SOLID, Laravel Patterns, Security, Performance. Nutzt laravel-reviewer Agent."
---

Fuehre ein Code Review durch fuer $ARGUMENTS im Laravel-Projekt (C:\work\repos\Laravel-2.0).

## Review-Checkliste

### 1. SOLID Principles
- Single Responsibility: Jede Klasse hat EINE Verantwortlichkeit?
- Open-Closed: Erweiterbar ohne bestehenden Code zu aendern?
- Dependency Inversion: Constructor Injection statt Facades in Services?

### 2. Laravel Patterns
- Eager Loading (kein N+1)?
- FormRequests fuer Validation?
- API Resources fuer Responses?
- config() statt env()?
- Named Routes?

### 3. Security (OWASP)
- Mass Assignment geschuetzt ($fillable/$guarded)?
- Keine Raw Queries ohne Binding?
- CSRF Protection?
- Authorization via Policies?

### 4. Performance
- Eager Loading in Loops?
- Pagination statt all()?
- Chunk/Cursor fuer grosse Datasets?

### 5. Tests
- Existierende Tests gruen?
- Neue Tests fuer neue Services?

### 6. Behavior Preservation (bei Refactoring)
- Characterization Tests vorhanden und PASS?
- Alle public Methoden gemappt (alt -> neu)?
- Side-Effects erhalten (Observer, Events, Listeners)?
- Return-Types und Parameter kompatibel?
- Deprecated Wrapper korrekt delegieren?

## Output
Tabelle mit Severity (CRITICAL/HIGH/MEDIUM/LOW), Datei:Zeile, Finding, Empfehlung.
Empfehlung: APPROVED oder CHANGES_REQUESTED.
