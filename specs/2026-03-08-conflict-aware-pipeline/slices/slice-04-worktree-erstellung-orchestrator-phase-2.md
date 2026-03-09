# Slice 4: Worktree-Erstellung in Orchestrator Phase 2

> **Slice 4 von 4** für `conflict-aware-pipeline`

---

## Metadata (für Orchestrator)

| Key | Value |
|-----|-------|
| **ID** | `slice-04-worktree-erstellung-orchestrator-phase-2` |
| **Test** | `n/a — manuelle Verifikation (Markdown-Command-Dateien)` |
| **E2E** | `false` |
| **Dependencies** | `["slice-01-weave-rerere-setup-artifacts"]` |

---

## Test-Strategy (für Orchestrator Pipeline)

> **Quelle:** Kein Code-Stack erkannt — Deliverables sind Markdown-Command-Dateien.

| Key | Value |
|-----|-------|
| **Stack** | `markdown-commands` |
| **Test Command** | `n/a` |
| **Integration Command** | `n/a` |
| **Acceptance Command** | Manuelle Prüfung: Datei öffnen, Worktree-Block und State-Felder gegen ACs prüfen |
| **Start Command** | `n/a` |
| **Health Endpoint** | `n/a` |
| **Mocking Strategy** | `no_mocks` |

---

## Ziel

Ergänzt Phase 2 (Setup & State Management) beider Orchestrator-Commands um einen Worktree-Erstellungs-Block, der `git worktree add worktrees/{feature} -b feature/{feature}` bei Pipeline-Start ausführt, sofern kein Worktree existiert, und `worktree_path` + `branch` im State speichert. Phase 5 erhält einen Cleanup-Hinweis mit `git worktree remove`/`git worktree prune`.

---

## Acceptance Criteria

1) GIVEN `plugins/clemens/commands/orchestrate.md` Phase 2 wird gelesen
   WHEN der Implementer den Worktree-Block einfügt
   THEN steht er nach der State-Initialisierung (nach dem `state = {...}` Block) und vor Phase 2b (Stack Detection) — Einfügestelle: zwischen Zeile ~105 und dem `## Phase 2b` Header

2) GIVEN `plugins/clemens/commands/slim-orchestrate.md` Phase 2 wird gelesen
   WHEN der Implementer den Worktree-Block einfügt
   THEN steht er nach der State-Initialisierung (nach dem `state = {...}` Block inklusive Resume-Logik) und vor `## Phase 2b: Stack Detection` — Einfügestelle: zwischen Zeile ~116 und dem `## Phase 2b` Header

3) GIVEN ein neuer Pipeline-Start ohne existierenden Worktree unter `worktrees/{feature_name}/`
   WHEN der Worktree-Block ausgeführt wird
   THEN enthält er den Befehl `git worktree add worktrees/{feature_name} -b feature/{feature_name}` und schreibt `worktree_path` (Wert: `worktrees/{feature_name}`) sowie `branch` (Wert: `feature/{feature_name}`) in das State-Objekt

4) GIVEN ein Worktree unter `worktrees/{feature_name}/` existiert bereits (Resume-Szenario)
   WHEN der Worktree-Block prüft ob der Worktree vorhanden ist
   THEN wird `git worktree add` NICHT erneut ausgeführt — der Block enthält einen Existenz-Check (`Bash("git worktree list")` oder `Glob("worktrees/{feature_name}/.git")`) und überspringt die Erstellung

5) GIVEN `plugins/clemens/commands/orchestrate.md` Phase 5 wird gelesen
   WHEN der Implementer den Cleanup-Hinweis einfügt
   THEN enthält Phase 5 einen Hinweis mit beiden Cleanup-Befehlen: `git worktree remove worktrees/{feature_name}` (sauber entfernen) und `git worktree prune` (verwaiste Einträge bereinigen)

6) GIVEN `plugins/clemens/commands/slim-orchestrate.md` Phase 5 wird gelesen
   WHEN der Implementer den Cleanup-Hinweis einfügt
   THEN enthält Phase 5 denselben Cleanup-Hinweis wie orchestrate.md (identische Änderung)

---

## Test Skeletons

> **Für den Test-Writer-Agent:** Stack ist `markdown-commands` — Tests sind strukturelle Datei-Checks via Checklisten.

### Test-Datei: `specs/2026-03-08-conflict-aware-pipeline/slices/slice-04-worktree-erstellung-orchestrator-phase-2.test.md`

<test_spec>
```markdown
<!-- AC-1: orchestrate.md — Einfügestelle Phase 2 -->
- [ ] Prüfe: Worktree-Block steht in orchestrate.md nach dem `state = {` Block
- [ ] Prüfe: Worktree-Block steht in orchestrate.md vor dem `## Phase 2b` Header

<!-- AC-2: slim-orchestrate.md — Einfügestelle Phase 2 -->
- [ ] Prüfe: Worktree-Block steht in slim-orchestrate.md nach dem `state = {` Block (inkl. Resume-Logik)
- [ ] Prüfe: Worktree-Block steht in slim-orchestrate.md vor dem `## Phase 2b: Stack Detection` Header

<!-- AC-3: Worktree-Erstellung — Befehl und State-Felder -->
- [ ] Prüfe: `git worktree add worktrees/{feature_name} -b feature/{feature_name}` im Block enthalten
- [ ] Prüfe: `worktree_path` wird im State gesetzt (Wert: `worktrees/{feature_name}`)
- [ ] Prüfe: `branch` wird im State gesetzt (Wert: `feature/{feature_name}`)

<!-- AC-4: Existenz-Check — kein doppelter Worktree -->
- [ ] Prüfe: Block enthält einen Existenz-Check vor dem `git worktree add` Befehl
- [ ] Prüfe: Existenz-Check nutzt `git worktree list` oder Filesystem-Check auf `worktrees/{feature_name}`
- [ ] Prüfe: `git worktree add` steht im ELSE-Zweig des Existenz-Checks

<!-- AC-5: orchestrate.md Phase 5 — Cleanup-Hinweis -->
- [ ] Prüfe: Phase 5 in orchestrate.md enthält `git worktree remove worktrees/{feature_name}`
- [ ] Prüfe: Phase 5 in orchestrate.md enthält `git worktree prune`

<!-- AC-6: slim-orchestrate.md Phase 5 — Cleanup-Hinweis -->
- [ ] Prüfe: Phase 5 in slim-orchestrate.md enthält `git worktree remove worktrees/{feature_name}`
- [ ] Prüfe: Phase 5 in slim-orchestrate.md enthält `git worktree prune`
```
</test_spec>

---

## Integration Contract

### Requires From Other Slices

| Slice | Resource | Type | Validation |
|-------|----------|------|------------|
| `slice-01-weave-rerere-setup-artifacts` | `plugins/clemens/templates/weave-setup.md` | Template-Dokument | Muss existieren — wird im Worktree-Block als Referenz für den Dev erwähnt (Weave-Setup ist Voraussetzung) |

### Provides To Other Slices

| Resource | Type | Consumer | Interface |
|----------|------|----------|-----------|
| `worktree_path` im State | State-Feld (String) | Slice 4 Phase 4b (conflict-scanner Aufruf) | `state.worktree_path` → z.B. `"worktrees/my-feature"` |
| `branch` im State | State-Feld (String) | Slice 4 Phase 4b (--branch Argument) | `state.branch` → z.B. `"feature/my-feature"` |

---

## Deliverables (SCOPE SAFEGUARD)

<!-- DELIVERABLES_START -->
- [ ] `plugins/clemens/commands/orchestrate.md` — Phase 2 erhält Worktree-Erstellungs-Block (nach State-Init, vor Phase 2b); Phase 5 erhält Cleanup-Hinweis
- [ ] `plugins/clemens/commands/slim-orchestrate.md` — Identische Änderungen wie orchestrate.md
<!-- DELIVERABLES_END -->

> **Hinweis:** Test-Dateien gehören NICHT in Deliverables. Der Test-Writer-Agent erstellt Tests basierend auf den Test Skeletons oben.

---

## Constraints

**Scope-Grenzen:**
- Dieser Slice implementiert KEINE Phase 4b (Conflict-Scanner-Aufruf) — das gehört zu Slice 4 Phase 4b (separater Scope)
- Kein `gh issue edit` / Label-Wechsel in diesem Slice
- Kein `Task(conflict-reporter)` — gehört zur Orchestrator-Integration
- Der Worktree-Block führt `git worktree add` aus, aber NICHT `weave-cli setup` oder `git config rerere.enabled` — diese sind manueller Einmalaufwand laut weave-setup.md

**Technische Constraints:**
- Existenz-Check vor `git worktree add`: Bash-Aufruf (`git worktree list`) oder Filesystem-Glob — kein Blind-Aufruf der zu einem Fehler führen würde
- State-Felder `worktree_path` und `branch` werden in das bestehende `state = {...}` Objekt ergänzt (nicht als separates Objekt)
- Beide Command-Dateien müssen identisch geändert werden — kein divergierendes Verhalten zwischen orchestrate.md und slim-orchestrate.md
- Phase 5 Cleanup-Hinweis: als Kommentar/Hinweis im bestehenden Phase-5-Block — nicht als neue Phase

**Referenzen:**
- Architecture: `specs/2026-03-08-conflict-aware-pipeline/architecture.md` → Section "Migration Map" (exakte Einfügestellen-Beschreibung pro Command-Datei)
- Architecture: `specs/2026-03-08-conflict-aware-pipeline/architecture.md` → Section "Risks & Mitigation" (Zeile: "Git Worktree Cleanup vergessen" → Cleanup in Phase 5)
- Architecture: `specs/2026-03-08-conflict-aware-pipeline/architecture.md` → Section "Integrations" (Worktree Isolation: `git worktree add`)
- Discovery: `specs/2026-03-08-conflict-aware-pipeline/discovery.md` → Section "Architecture: Pipeline-Flow" (Schritt 1: `git worktree add worktrees/{feature} -b feature/{feature}`)
