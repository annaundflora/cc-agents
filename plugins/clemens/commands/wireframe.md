---
description: "Erstellt Wireframes + UX Expert Review + automatische Gate 0 Compliance (max 3 Retries). Basiert auf Anthropic Fresh Context Pattern."
---

# Wireframe mit UX Expert Review + Gate 0 Compliance

Du führst den **Wireframe-Agent** mit automatischem **UX Expert Review** und **Gate 0 Compliance** aus.

**Input:** $ARGUMENTS

---

## Phase 1: Input-Validierung

1. Prüfe ob `$ARGUMENTS` einen Spec-Pfad enthält
2. Falls kein Argument: Suche neuestes `specs/*/discovery.md` und frage via AskUserQuestion
3. Validiere dass `discovery.md` existiert im Spec-Ordner
4. Falls nicht: STOP mit Hinweis "Zuerst /discovery ausführen"

**Spec-Pfad ermitteln:** Extrahiere den Ordnerpfad aus $ARGUMENTS oder dem gefundenen Discovery

---

## Phase 2: Wireframe-Erstellung

1. Lies die Agent-Definition: `${CLAUDE_PLUGIN_ROOT}/agents/wireframe.md`
2. Übernimm die dort beschriebenen Workflows und Verhaltensweisen
3. Erstelle `wireframes.md` nach dem Template in `${CLAUDE_PLUGIN_ROOT}/templates/wireframe-template.md`
4. Speichere im Spec-Ordner (gleicher Ordner wie discovery.md)

---

## Phase 3: UX Expert Review

Nach Wireframe-Erstellung, VOR Gate 0 Compliance:

```
spec_path = [ermittelter Spec-Ordner]

# 1. UX Expert Review mit FRISCHEM CONTEXT
ux_result = Task(
  subagent_type: "ux-expert-review",
  prompt: "Führe einen UX Expert Review durch für: {spec_path}

  Lies:
  - {spec_path}/discovery.md
  - {spec_path}/wireframes.md

  Erstelle: {spec_path}/checks/ux-expert-review.md

  WICHTIG: Du bist READ-ONLY! Editiere KEINE Discovery/Wireframe-Dateien.
  Erstelle NUR den Review Report.

  Returne am Ende EXAKT dieses Format:
  VERDICT: APPROVED oder CHANGES_REQUESTED
  FINDINGS: [Liste aller Findings mit ID, Titel, Severity]"
)

# 2. Findings interaktiv präsentieren
IF ux_result enthält Findings:

  FOR each finding IN findings:
    # Zeige Finding und frage PM
    AskUserQuestion(
      question: "UX Finding {finding.id}: {finding.title}
        Severity: {finding.severity}
        Problem: {finding.problem}
        Empfehlung: {finding.recommendation}

        Wie möchtest du vorgehen?",
      options: [
        {label: "Umsetzen", description: "Finding jetzt in Wireframe/Discovery einarbeiten"},
        {label: "Merken für später", description: "Finding akzeptieren, aber erst in späterem Schritt umsetzen"},
        {label: "Ablehnen", description: "Finding ist nicht relevant oder bewusste Design-Entscheidung"}
      ]
    )

  # 3. PM-Review: Eigene Anmerkungen?
  AskUserQuestion(
    question: "Hast du eigene UX-Anmerkungen oder Ergänzungen die noch eingearbeitet werden sollen?",
    options: [
      {label: "Nein, weiter zu Gate 0", description: "Keine weiteren Anmerkungen"},
      {label: "Ja, ich habe Anmerkungen", description: "Eigene UX-Punkte ergänzen"}
    ]
  )

  # Falls PM Anmerkungen hat: Diese ebenfalls umsetzen

  # 4. Akzeptierte Findings umsetzen
  FOR each accepted_finding (wo Antwort == "Umsetzen"):
    # WICHTIG: Read vor Edit!
    Read({spec_path}/wireframes.md)
    Read({spec_path}/discovery.md)

    # Empfehlung des Findings in wireframes.md und/oder discovery.md einarbeiten
    # Je nach "Betrifft" im Finding: Wireframe-Änderung und/oder Discovery-Änderung

  OUTPUT an User:
  "✅ **UX Expert Review abgeschlossen**

  - Review Report: {spec_path}/checks/ux-expert-review.md
  - {count_umsetzen} Findings umgesetzt
  - {count_merken} Findings für später gemerkt
  - {count_ablehnen} Findings abgelehnt

  → Weiter zu Gate 0 Compliance..."

ELSE:
  OUTPUT an User:
  "✅ **UX Expert Review: Keine Findings**
  → Weiter zu Gate 0 Compliance..."
```

---

## Phase 4: Gate 0 Compliance Loop

Nach dem Erstellen/Fixen von wireframes.md:

```
retry_count = 0
MAX_RETRIES = 9
spec_path = [ermittelter Spec-Ordner]

LOOP:
  # Compliance Check mit FRISCHEM CONTEXT (Anthropic Pattern)
  # "Subagents get their own fresh context, completely separate from main conversation"

  compliance_result = Task(
    subagent_type: "discovery-wireframe-compliance",
    prompt: "Prüfe Compliance für: {spec_path}

    Lies:
    - {spec_path}/discovery.md
    - {spec_path}/wireframes.md

    Erstelle: {spec_path}/compliance-discovery-wireframe.md

    WICHTIG: Du bist READ-ONLY! Editiere KEINE Dateien selbst.

    Returne am Ende EXAKT dieses Format:
    VERDICT: APPROVED oder FAILED
    BLOCKING_ISSUES: [Liste falls FAILED]
    DISCOVERY_UPDATES: [JSON-Array mit Updates, siehe Agent-Definition]"
  )

  # Parse das Ergebnis

  # 1. Discovery Updates anwenden (DU führst die Edits durch, nicht der Sub-Agent!)
  IF compliance_result enthält "DISCOVERY_UPDATES:" UND Array nicht leer:
    discovery_updates = parse JSON aus DISCOVERY_UPDATES Block

    FOR each update IN discovery_updates:
      # Lies die aktuelle Discovery
      discovery_content = Read({spec_path}/discovery.md)

      # Finde die Ziel-Section und füge ein/ersetze
      IF update.add_line:
        # Finde "after" Zeile und füge danach ein
        Edit({spec_path}/discovery.md,
          old_string: update.after,
          new_string: update.after + "\n" + update.add_line
        )
      ELSE IF update.replace_line:
        Edit({spec_path}/discovery.md,
          old_string: update.replace_line,
          new_string: update.with
        )

    OUTPUT an User:
    "🔧 Discovery aktualisiert mit {len(discovery_updates)} Wireframe-Details"

  # 2. Verdict prüfen
  IF compliance_result enthält "VERDICT: APPROVED":
    OUTPUT an User:
    "✅ **Gate 0 APPROVED**

    Wireframes sind konsistent mit Discovery.
    - wireframes.md ✓
    - compliance-discovery-wireframe.md ✓
    - discovery.md aktualisiert (falls Updates nötig waren)

    **Nächster Schritt:** /architecture {spec_path}"
    STOP (Erfolg)

  IF compliance_result enthält "VERDICT: FAILED":
    retry_count++

    IF retry_count >= MAX_RETRIES:
      OUTPUT an User:
      "❌ **HARD EXIT: Gate 0 nach 3 Versuchen fehlgeschlagen**

      Blocking Issues:
      {compliance_result.blocking_issues}

      **Manuelle Korrektur erforderlich.**
      Bitte wireframes.md oder discovery.md manuell fixen und /wireframe erneut starten."
      STOP (Fehler)

    # Fix-Versuch
    OUTPUT an User:
    "⚠️ **Gate 0 FAILED** (Versuch {retry_count}/3)

    Blocking Issues: {compliance_result.blocking_issues}
    → Versuche automatischen Fix..."

    # Wireframe fixen
    Lies erneut `${CLAUDE_PLUGIN_ROOT}/agents/wireframe.md`
    Lies `{spec_path}/compliance-discovery-wireframe.md` für die Issues
    Korrigiere `{spec_path}/wireframes.md` basierend auf:
    - Blocking Issues aus dem Compliance Report
    - "Required Wireframe Updates" Section
    - "Required Discovery Updates" Section (nur informativ)

    GOTO LOOP
```

---

## Output

Nach erfolgreichem Durchlauf:

```
{spec_path}/
├── discovery.md                        # Input (existiert)
├── wireframes.md                       # NEU erstellt (Phase 2)
├── checks/
│   └── ux-expert-review.md             # NEU erstellt (Phase 3)
└── compliance-discovery-wireframe.md   # NEU erstellt (Phase 4, Gate 0)
```

---

## Wichtig: Fresh Context Pattern

Jeder Gate-Check läuft als **separater Sub-Agent** mit eigenem Context:
- Der Compliance-Agent sieht NICHT den Wireframe-Erstellungs-Context
- Das verhindert Confirmation Bias
- Quelle: Anthropic "Subagents get their own fresh context"
