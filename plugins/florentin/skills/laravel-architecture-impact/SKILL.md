---
name: laravel-architecture-impact
description: "Cross-Layer Impact Analyse fuer Laravel-Aenderungen. Findet alle betroffenen Dateien wenn ein Model, Service oder Controller geaendert wird."
---

# Laravel Architecture Impact Analysis

Wenn eine Datei geaendert wird, finde ALLE betroffenen Dateien ueber alle Layer hinweg.

## Impact-Matrix

### Model geaendert
```
1. Services die das Model injizieren oder nutzen
   -> Grep: use App\Models\{ModelName}
   -> Grep: {ModelName}::

2. Controllers die das Model oder seine Services nutzen
   -> Grep nach Service-Klassen die das Model nutzen

3. Observers
   -> app/Observers/{ModelName}Observer.php
   -> app/Providers/ -> Observer-Registrierung

4. Events die das Model als Property haben
   -> Grep: {ModelName} in app/Events/

5. Listeners die auf Model-Events reagieren
   -> EventServiceProvider -> $listen Array

6. Form Requests mit Model-bezogener Validation
   -> Grep: {model_name} in app/Http/Requests/

7. Factories und Tests
   -> database/factories/{ModelName}Factory.php
   -> Grep: {ModelName} in tests/

8. API Resources
   -> Grep: {ModelName} in app/Http/Resources/
```

### Service geaendert
```
1. Controllers die den Service injizieren
   -> Grep: use App\Services\...\{ServiceName}
   -> Grep: {ServiceName} in app/Http/Controllers/

2. Andere Services die diesen Service nutzen
   -> Grep: {ServiceName} in app/Services/

3. Actions die den Service nutzen
   -> Grep: {ServiceName} in app/Actions/

4. Jobs die den Service nutzen
   -> Grep: {ServiceName} in app/Jobs/

5. Tests
   -> Grep: {ServiceName} in tests/
```

### Controller geaendert
```
1. Routes
   -> Grep: {ControllerName} in routes/

2. Form Requests (Parameter-Aenderungen)
   -> Methodensignaturen pruefen

3. Middleware
   -> Route-Definitionen pruefen

4. API Resources (Response-Aenderungen)
   -> Return-Statements pruefen
```

## Anwendung

```bash
# Beispiel: OrderService wird refactored
# Schritt 1: Direkte Nutzer finden
grep -r "OrderService" app/ --include="*.php" -l

# Schritt 2: Indirekte Nutzer (via Model)
grep -r "Order::" app/ --include="*.php" -l

# Schritt 3: Events/Listeners
grep -r "OrderEvent\|OrderCreated\|OrderUpdated" app/ --include="*.php" -l

# Schritt 4: Tests
grep -r "OrderService\|OrderTest" tests/ --include="*.php" -l
```

## Output
Erstelle eine Impact-Tabelle:

| Layer | Datei | Beziehung | Aenderung noetig? |
|-------|-------|-----------|-------------------|
