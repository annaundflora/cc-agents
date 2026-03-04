---
name: analyze
description: "Tiefenanalyse einer Datei oder eines Bereichs im Laravel-Projekt. Nutzt codebase-researcher Agent."
---

Analysiere $ARGUMENTS im Laravel-Projekt (C:\work\repos\Laravel-2.0).

## Analyse-Dimensionen

### 1. Struktur-Analyse
- Alle Methoden auflisten (public/protected/private)
- Zeilen-Count gesamt und pro Methode
- Cyclomatic Complexity einschaetzen
- Constructor Dependencies (was wird injiziert?)

### 2. Abhaengigkeits-Analyse
Nutze `codebase-researcher` Agent fuer:
- **Upstream:** Wer ruft MICH auf? (Grep nach Klassenname + Methoden)
- **Downstream:** Wen rufe ICH auf? (use-Statements, Methoden-Aufrufe)
- **Events:** Welche Events werden dispatched/listened?
- **Observers:** Welche Observer reagieren auf dieses Model?

### 3. Pattern-Analyse
- Welche Design Patterns werden genutzt?
- Passt es zu den bestehenden DDD Bounded Contexts?
- Konsistenz mit Rest der Codebase?
- Anti-Patterns und Code Smells?

### 4. Test-Analyse
- Existierende Tests finden (Feature + Unit)
- Welche Methoden sind getestet, welche nicht?
- Test-Qualitaet bewerten (Happy Path + Error Path?)
- Fehlende Tests identifizieren

### 5. Refactoring-Potential
- Zu grosse Klasse? (>300 Zeilen = Kandidat)
- Mixed Responsibilities? (SRP-Verletzung?)
- Fehlende Type Hints / Return Types?
- God Object / Feature Envy?
- Extrahierbare Concerns/Traits?

## Output Format

```markdown
# Analyse: {Datei/Bereich}

## Uebersicht
| Metrik | Wert |
|--------|------|
| Zeilen | X |
| Methoden | X (public: X, protected: X, private: X) |
| Dependencies | X |
| Tests | X |

## Abhaengigkeiten
| Richtung | Datei | Methode | Typ |
|----------|-------|---------|-----|

## Code Smells
| Smell | Zeile | Severity | Vorschlag |
|-------|-------|----------|-----------|

## Empfehlungen
1. ...
```
