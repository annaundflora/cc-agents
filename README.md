# annaundflora Marketplace

Claude Code Plugin-Marketplace.

## Quick Start

```bash
# Marketplace hinzufuegen
/plugin marketplace add annaundflora/marketplace

# Alle Plugins anzeigen
/plugin

# Plugin installieren
/plugin install clemens@annaundflora
/plugin install florentin@annaundflora
```

## Plugins

| Plugin | Autor | Inhalt |
|--------|-------|--------|
| `clemens` | Clemens | 16 Agents, 8 Commands, 9 Templates |
| `florentin` | Florentin | 16 Agents, 5 Safeguards, 9 Commands, 5 Skills |

---

## Plugin: clemens

### Workflow
```
Discovery --> Wireframes --> Architecture --> Planning --> Implementation --> Testing
    |              |               |              |              |              |
  Gate 0        Gate 0          Gate 1        Gate 2/3     Code Review     QA Manual
```

16 Agents | 8 Commands | 9 Templates | Quality Gates (0-3)

## Plugin: florentin

### Workflow
```
Audit --> Discovery --> Dev --> Finalize
  |          |          |         |
 7 Layer   5 Phase    6 Phase   6 Check
Analysis  Research   Pipeline  + Safeguards
```

16 Agents | 5 Safeguards | 9 Commands | 5 Skills

### Agents
| Agent | Beschreibung |
|-------|--------------|
| `baseline-scanner` | Quantitative Baseline: Tests, LOC, God Objects |
| `business-criticality` | Business-Impact Scoring pro Modul |
| `codebase-researcher` | Systematische Abhaengigkeits-Analyse |
| `dependency-mapper` | Cross-Context Dependencies, Zyklen, Coupling |
| `frontend-analyst` | Vue 2/3 Komponenten, Logik-Verteilung |
| `git-historian` | Change-Frequenz, Churn, Hotspots, Co-Changes |
| `hackathon-finalize` | Abschluss-Check: Tests, Pint, Merge-Readiness |
| `hackathon-orchestrator` | Phasen-Steuerung, Agent-Teams, Sync-Punkte |
| `laravel-dev` | 6-Phasen Dev Pipeline mit Quality Gates |
| `laravel-discovery` | 7-Phasen Refactoring Discovery + Logic Map |
| `laravel-refactorer` | Quick-Refactor fuer isolierte Aenderungen |
| `laravel-reviewer` | Senior Code Review (SOLID, Security, Performance) |
| `logic-tracer` | End-to-End Business Process Tracing |
| `report-synthesizer` | Multi-Report Synthese zu Roadmap |
| `route-tracer` | Route -> Controller -> Service -> Model Trace |
| `test-coverage-auditor` | Coverage-Luecken, Test-Qualitaet |

### Safeguards
| Safeguard | Prueft |
|-----------|--------|
| `architecture-guardian` | DDD Bounded Contexts, Layer-Richtung, Zyklen |
| `behavior-preservation` | Verhalten exakt erhalten (5 Checks) |
| `laravel-standards-guardian` | PHP 8.3, Laravel Patterns, Pint |
| `security-guardian` | OWASP Top 10, Mass Assignment, XSS |
| `spec-compliance` | ACs implementiert, kein Scope Creep |

### Commands
`/analyze` `/audit` `/debug` `/dev` `/discovery` `/finalize` `/refactor` `/review` `/sparring`

### Skills
`characterization-testing` `eloquent-patterns` `laravel-architecture-impact` `logic-archaeology` `systematic-debugging`

---

## Eigenes Plugin hinzufuegen

1. Ordner `plugins/dein-name/` mit `.claude-plugin/plugin.json`, `agents/`, `commands/`, `skills/`
2. In `.claude-plugin/marketplace.json` registrieren
3. Push: `git add . && git commit -m "Add plugin: dein-name" && git push`
4. Update: `/plugin marketplace update annaundflora`
