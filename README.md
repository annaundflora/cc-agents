# clemens — Claude Code Plugin

Feature-Development-Pipeline für Claude Code. Von Discovery bis Deployment mit Quality Gates, Multi-Agent-Orchestrierung und Conflict-Aware Merge-Strategie.

**Version:** 1.2.0 · **Autor:** Clemens

---

## Installation

```bash
# 1. Marketplace hinzufügen
/plugin marketplace add annaundflora/cc-agents

# 2. Plugin installieren
/plugin install clemens@annaundflora
```

---

## Workflow

```
Discovery → Wireframe → Architecture → Planning → Implementation → Testing
    │            │            │            │              │              │
  Gate 0      Gate 0       Gate 1      Gate 2/3     Code Review     QA Manual
```

Jede Phase wird von einem dedizierten Command gesteuert. Quality Gates validieren automatisch nach jeder Phase.

---

## Commands

| Command | Beschreibung |
|---------|--------------|
| `/clemens:discovery` | Feature-Konzeption: strukturierte Q&A-Session → Discovery-Dokument |
| `/clemens:wireframe` | Wireframes + UX Expert Review + Gate 0 Compliance (max 3 Retries) |
| `/clemens:architecture` | Technische Architektur + Gate 1 Compliance (max 3 Retries) |
| `/clemens:planner` | Slice-Planung + Gate 2 (pro Slice) + Gate 3. Fresh Context Pattern. |
| `/clemens:slim-planner` | Schlanke Slice-Planung: ACs + Tests, kein Code. Anti-Bias-Fixes. |
| `/clemens:orchestrate` | Feature-Implementierung Wave-by-Wave. 6-Step Pipeline mit 9 Retries. |
| `/clemens:slim-orchestrate` | Wie orchestrate, aber AC-basierte Reviews statt Code-Example-basierte. |
| `/clemens:roadmap` | Strategische Produkt-Orientierung: Navigator, Priorisierer, Analyst. |
| `/clemens:debugger` | Systematische Fehlersuche (Hypothese → Logs → Analyse → Fix). |
| `/clemens:qa-manual` | Geführtes manuelles Feature-Testing mit Bug-Dokumentation. |
| `/clemens:pm-ux-review-de` | UX Expert Review mit automatischem Versioning. |

---

## Agents (Sub-Agents)

Die folgenden Agents werden von Commands via `Task()` aufgerufen — sie arbeiten autonom im Hintergrund.

### Discovery & Konzeption
| Agent | Aufgabe |
|-------|---------|
| `discovery` | Feature-Konzeption: divergiert (Optionen) → konvergiert (Scope, States, Flows) |
| `wireframe` | ASCII-Wireframes für Stakeholder-Validierung |
| `architecture` | Technische Konzeption: API, Datenbank, Security-Design |
| `roadmap` | Strategischer Roadmap-Agent |
| `ux-expert-review-de` | Senior UX Expert Review auf Deutsch |

### Quality Gates
| Agent | Gate | Prüft |
|-------|------|-------|
| `discovery-wireframe-compliance` | Gate 0 | Discovery → Wireframe bidirektionale Konsistenz |
| `architecture-compliance` | Gate 1 | Architecture gegen Discovery + Wireframes |
| `slice-compliance` | Gate 2 | Slice gegen Architecture und Wireframes |
| `slim-slice-compliance` | Gate 2 | Hybrid: deterministische Checks + LLM-Checks |
| `integration-map` | Gate 3 | E2E-Validierung nach allen Slices |

### Planning & Implementation
| Agent | Aufgabe |
|-------|---------|
| `slice-writer` | Schreibt einzelne Slice-Spezifikationen mit vollständigem Kontext |
| `slim-slice-writer` | Schlanke Slice-Specs: ACs + Test-Skeletons + Contracts |
| `slim-slicer` | Zerlegt Discovery-Slices in atomare 1-3-Datei-Tasks |
| `slice-implementer` | Implementiert exakt einen Slice, kein Overhead |
| `slim-slice-implementer` | Task-Driven Implementierung gegen ACs + Architecture |

### Review & Testing
| Agent | Aufgabe |
|-------|---------|
| `code-reviewer` | Adversarial Code-Review gegen Slice-Spec + Architecture |
| `slim-code-reviewer` | AC-basierter Review (statt Code-Examples) |
| `test-writer` | Schreibt Tests gegen Slice ACs. 100% AC-Coverage. |
| `test-validator` | Führt alle Test-Stages aus, liefert strukturierten JSON-Report |
| `debugger` | Wissenschaftliche Fehlersuche: Hypothese → Logs → Fix |

### Conflict-Aware Pipeline
| Agent | Aufgabe |
|-------|---------|
| `conflict-reporter` | Liest `overlap-report.json`, kommentiert betroffene GitHub Issues via `gh` |

### QA
| Agent | Aufgabe |
|-------|---------|
| `qa-manual` | Manuelles Feature-Testing mit User-Interaktion + Bug-Summary |

---

## Scripts

### `conflict-scanner.js`

Scannt parallele Pipeline-Sessions auf Entity-Konflikte und erstellt einen Overlap-Report.

```bash
node plugins/clemens/scripts/conflict-scanner.js \
  --branch feature/my-feature \
  --spec-path specs/my-feature \
  --repo owner/repo \
  [--weave]
```

| Exit Code | Bedeutung |
|-----------|-----------|
| `0` | Kein Overlap — Pipeline kann mergen |
| `1` | Overlap gefunden — `conflict-reporter` Agent wird getriggert |
| `2` | Fehler (gh/git nicht verfügbar) — non-blocking |

**Outputs:** `{spec-path}/claims.json`, `{spec-path}/overlap-report.json`

---

## Templates

| Template | Verwendung |
|----------|-----------|
| `discovery-feature.md` | Basis-Template für Discovery-Dokumente |
| `architecture-feature.md` | Basis-Template für Architecture-Dokumente |
| `plan-spec.md` / `slim-plan-spec.md` | Slice-Spezifikations-Templates |
| `wireframe-template.md` | Wireframe-Struktur |
| `roadmap.md` | Roadmap-Template |
| `project.md` | Projekt-Kontext-Template |
| `summary.md` | Feature-Summary-Template |
| `checkpoint-example.md` | Checkpoint-Dokumentation |
| `ui-implementation-checklist.md` | UI-Implementierungs-Checkliste |
| `weave-setup.md` | Installations-Anleitung für Weave CLI + rerere |
| `gitattributes-weave.template` | `.gitattributes` mit Weave merge driver + funcname-Patterns |

---

## Updates

Auto-Update ist für Third-Party-Marketplaces standardmäßig **deaktiviert**.

**Manuell updaten:**
```bash
claude plugin update clemens
```

**Auto-Update aktivieren:**
```
/plugin → Marketplaces → annaundflora → Enable auto-update
```

> Neue Plugin-Versionen erfordern immer einen Version-Bump in `plugin.json` — ohne Bump erkennt Claude Code keine neue Version (Caching).

---

## Plugin hinzufügen

1. Ordner `plugins/dein-name/` mit `.claude-plugin/plugin.json`, `agents/`, `commands/`
2. In `.claude-plugin/marketplace.json` registrieren
3. Push → `/plugin marketplace update annaundflora`
