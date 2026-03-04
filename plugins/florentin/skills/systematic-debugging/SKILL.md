---
name: systematic-debugging
description: "Strukturiertes Debugging fuer Laravel. Reproduzieren, Bisect, Isolieren, Fixen, Regression-Test."
---

# Systematic Debugging fuer Laravel

## Debugging-Entscheidungsbaum

```
Problem gemeldet
  |
  v
Reproduzierbar?
  |-- NEIN -> Logs analysieren (storage/logs/laravel.log)
  |           -> Sentry/Error Tracking pruefen
  |           -> Timing/Race Condition vermuten
  |
  |-- JA -> Wo tritt es auf?
              |
              |-- HTTP Request -> Route -> Controller -> Service tracen
              |-- Artisan Command -> Command-Klasse -> Service tracen
              |-- Queue Job -> Job-Klasse -> Service tracen
              |-- Scheduled Task -> Schedule -> Command tracen
              |-- Test -> Test-Setup pruefen (Factories, Mocks, DB State)
```

## Debug-Werkzeuge (Laravel-spezifisch)

### 1. Logging
```php
// Temporaeres Debug-Logging (VOR dem Fix entfernen!)
Log::debug('DEBUG: {context}', ['var' => $value]);
// ODER
dump($variable); // In Tests
dd($variable);   // Stop & Dump (NICHT in Production)
```

### 2. Tinker (Live REPL)
```bash
sail artisan tinker
# Queries testen
App\Models\Order::where('status', 'pending')->count();
# Service testen
app(App\Services\OrderService::class)->findOrder($id);
```

### 3. Query Debugging
```php
// N+1 erkennen
DB::enableQueryLog();
// ... Code ausfuehren ...
dd(DB::getQueryLog());

// ODER in .env:
TELESCOPE_ENABLED=true  // Laravel Telescope
```

### 4. Git Bisect (wann wurde es kaputt?)
```bash
git bisect start
git bisect bad           # Aktueller Stand ist kaputt
git bisect good abc123   # Dieser Commit war noch OK
# Git fuehrt Binary Search durch
sail artisan test --filter=RelevantTest
git bisect good/bad      # Je nach Test-Ergebnis
git bisect reset         # Wenn Commit gefunden
```

## Anti-Patterns beim Debugging

| Anti-Pattern | Stattdessen |
|-------------|-------------|
| Blindes Aendern und Hoffen | Stack Trace lesen, Hypothese bilden |
| dd() ueberall | Gezielt an einer Stelle loggen |
| Fix ohne Test | Test schreiben der den Bug reproduziert |
| Grosses Refactoring als "Fix" | Minimaler Fix, Refactoring separat |
| Nur Happy Path fixen | Edge Cases pruefen |

## Checkliste nach Fix

- [ ] Test geschrieben der den Bug reproduziert (VOR dem Fix: FAIL)
- [ ] Fix implementiert (Test: PASS)
- [ ] `sail artisan test --parallel` – keine Regressions
- [ ] Alle temporaeren debug-Statements entfernt
- [ ] `vendor/bin/pint --dirty`
