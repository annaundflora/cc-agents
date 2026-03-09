# Slice 1: Weave + rerere Setup-Artifacts erstellen

> **Slice 1 von 4** für `conflict-aware-pipeline`

---

## Metadata (für Orchestrator)

| Key | Value |
|-----|-------|
| **ID** | `slice-01-weave-rerere-setup-artifacts` |
| **Test** | `n/a — manuelle Verifikation (Markdown/Template-Deliverables)` |
| **E2E** | `false` |
| **Dependencies** | `[]` |

---

## Test-Strategy (für Orchestrator Pipeline)

> **Quelle:** Kein Code-Stack erkannt — Repository ist spec/agent-only. Deliverables sind Markdown-Templates.

| Key | Value |
|-----|-------|
| **Stack** | `markdown-templates` |
| **Test Command** | `n/a` |
| **Integration Command** | `n/a` |
| **Acceptance Command** | Manuelle Prüfung: Datei öffnen, Inhalte gegen ACs checken |
| **Start Command** | `n/a` |
| **Health Endpoint** | `n/a` |
| **Mocking Strategy** | `no_mocks` |

---

## Ziel

Erstellt zwei statische Setup-Artefakte für Ziel-Repos: ein `.gitattributes`-Template mit Weave merge driver Eintrag und funcname-Patterns für TypeScript, Python und Go sowie eine `weave-setup.md`-Anleitung mit allen Installations- und Einrichtungsbefehlen. Diese Dateien werden von Devs einmalig manuell in ihre Repos eingespielt — kein Orchestrator-Code, keine Automatisierung in diesem Slice.

---

## Acceptance Criteria

1) GIVEN das Deliverable `gitattributes-weave.template` existiert
   WHEN ein Dev die Datei öffnet
   THEN enthält sie einen `merge=weave` Treiber-Eintrag für alle relevanten Quellcode-Dateierweiterungen UND funcname-Pattern-Definitionen für mindestens TypeScript (`.ts`, `.tsx`), Python (`.py`) und Go (`.go`) — Syntax valide für direkte Nutzung als `.gitattributes`

2) GIVEN das Deliverable `weave-setup.md` existiert
   WHEN ein Dev die Anleitung von oben nach unten folgt
   THEN kann er alle Prerequisites (Rust/Cargo, weave-cli, weave-driver, gh CLI) mit den enthaltenen Befehlen installieren — kein externer Link muss geöffnet werden, alle Befehle sind copy-paste-fähig

3) GIVEN `weave-setup.md` enthält den Repository-Setup-Abschnitt
   WHEN ein Dev die Repo-Setup-Befehle ausführt
   THEN wird `git config rerere.enabled true` explizit aufgeführt UND `weave-cli setup` als Befehl zum Einrichten des Merge Drivers im Repo enthalten sein

4) GIVEN das Template `gitattributes-weave.template`
   WHEN ein Dev es als `.gitattributes` in ein Repo kopiert und `git diff` auf eine TypeScript-Datei ausführt
   THEN zeigen die `@@`-Hunk-Header Entity-Namen (Funktionsnamen) statt nur Zeilennummern — Voraussetzung: funcname-Pattern für `*.ts diff=typescript` ist korrekt

5) GIVEN `weave-setup.md`
   WHEN ein Dev nach der Installation den optionalen Validierungsschritt ausführt
   THEN zeigt `weave-cli setup --dry-run` oder ein äquivalenter Verifikationsbefehl dass Setup erfolgreich wäre — der Verifikationsschritt ist in der Anleitung dokumentiert

---

## Test Skeletons

> **Für den Test-Writer-Agent:** Stack ist `markdown-templates` — Tests sind strukturelle Datei-Checks, keine Unit-Tests. Skeletons beschreiben manuelle oder script-basierte Verifikation.

### Test-Datei: `specs/2026-03-08-conflict-aware-pipeline/slices/slice-01-weave-rerere-setup-artifacts.test.md`

<test_spec>
```markdown
<!-- AC-1: gitattributes enthält Weave Driver + funcname-Patterns -->
- [ ] Prüfe: `gitattributes-weave.template` enthält `merge=weave` Eintrag
- [ ] Prüfe: Pattern für `*.ts` und `*.tsx` mit funcname-Definition vorhanden
- [ ] Prüfe: Pattern für `*.py` mit funcname-Definition vorhanden
- [ ] Prüfe: Pattern für `*.go` mit funcname-Definition vorhanden

<!-- AC-2: weave-setup.md enthält vollständige Prerequisites-Befehle -->
- [ ] Prüfe: Rust/Cargo Installationsbefehl vorhanden (curl-basiert)
- [ ] Prüfe: weave-cli cargo-Installationsbefehl vorhanden (GitHub URL)
- [ ] Prüfe: weave-driver cargo-Installationsbefehl vorhanden (GitHub URL)
- [ ] Prüfe: gh CLI Installationshinweis vorhanden

<!-- AC-3: git rerere + weave-cli setup in Anleitung -->
- [ ] Prüfe: `git config rerere.enabled true` in weave-setup.md enthalten
- [ ] Prüfe: `weave-cli setup` als Repo-Setup-Befehl enthalten

<!-- AC-4: funcname-Pattern erzeugt Entity-Namen in git diff Hunk Headers -->
- [ ] Validiere: TypeScript funcname-Regex matcht Funktionsdeklarationen wie `function Foo(` und `const bar = (`
- [ ] Validiere: Pattern-Syntax ist .gitattributes-kompatibel

<!-- AC-5: Validierungsschritt in Anleitung dokumentiert -->
- [ ] Prüfe: weave-setup.md enthält einen Verifikationsbefehl nach Setup
```
</test_spec>

---

## Integration Contract

### Requires From Other Slices

| Slice | Resource | Type | Validation |
|-------|----------|------|------------|
| — | Keine Dependencies | — | — |

### Provides To Other Slices

| Resource | Type | Consumer | Interface |
|----------|------|----------|-----------|
| `plugins/clemens/templates/gitattributes-weave.template` | Template-Datei | Slice 2, Slice 4, Devs | Direkt als `.gitattributes` kopierbar |
| `plugins/clemens/templates/weave-setup.md` | Installations-Anleitung | Devs, Slice 4 (Referenz) | Standalone-Dokument |

---

## Deliverables (SCOPE SAFEGUARD)

<!-- DELIVERABLES_START -->
- [ ] `plugins/clemens/templates/weave-setup.md` — Vollständige Installations- und Einrichtungsanleitung für Weave CLI, Weave Driver, gh CLI, rerere und Repo-Setup
- [ ] `plugins/clemens/templates/gitattributes-weave.template` — `.gitattributes`-Template mit Weave merge driver Eintrag und funcname-Patterns für TypeScript, Python und Go
<!-- DELIVERABLES_END -->

> **Hinweis:** Test-Dateien gehören NICHT in Deliverables. Der Test-Writer-Agent erstellt Tests basierend auf den Test Skeletons oben.

---

## Constraints

**Scope-Grenzen:**
- Dieser Slice implementiert KEINEN Orchestrator-Code und KEINE Automatisierung
- KEIN `weave-cli setup` wird hier ausgeführt — nur die Anleitung dazu wird geschrieben
- KEINE Worktree-Erstellung (gehört zu Slice 4 / Orchestrator Integration)
- KEINE Änderungen an bestehenden Orchestrator-Dateien (`orchestrate.md`, `slim-orchestrate.md`)

**Technische Constraints:**
- funcname-Patterns müssen valide `.gitattributes` Regex-Syntax sein (POSIX Extended Regular Expressions)
- Weave CLI Version: `v0.2.3` (Stand 2026-03-09) — Installations-URL aus discovery.md → Prerequisites-Tabelle
- Alle Cargo-Befehle nutzen `--git https://github.com/Ataraxy-Labs/weave` als Quelle

**Referenzen:**
- Architecture: `specs/2026-03-08-conflict-aware-pipeline/architecture.md` → Section "Context & Research: Weave CLI Documentation" + "Integrations"-Tabelle
- Discovery: `specs/2026-03-08-conflict-aware-pipeline/discovery.md` → Section "Prerequisites"-Tabelle (exakte Befehle) + "Git Diff Hunk Header Entity Extraction" (funcname-Pattern-Logik)
- Architecture: `specs/2026-03-08-conflict-aware-pipeline/architecture.md` → "Entity Extraction Strategy" Tabelle (TypeScript/Python/Go Hunk Header Patterns)
