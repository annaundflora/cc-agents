---
name: logic-archaeology
description: "Systematische Ausgrabung ALLER verteilten Business-Logik fuer ein Feature/Domain. Findet implizites Wissen, undokumentierte Regeln, versteckte Side-Effects. Das fehlende Stueck zwischen 80% und 95% Refactoring-Erfolg."
---

# Logic Archaeology – Verteilte Business-Logik komplett aufdecken

> **Das Problem:** In gewachsenen Laravel-Projekten ist Business-Logik ueber 5-8 Layer verteilt.
> Ein Teil steckt im Controller, ein Teil im Service, ein Teil im Observer, ein Teil in einem Helper,
> ein Teil in einer Blade-Direktive, ein Teil in einer Vue-Komponente.
> Wer nur die Service-Klasse refactored, bricht die anderen 60%.

> **Referenz:** Michael Feathers, "Working Effectively with Legacy Code" –
> "The first step is understanding what the code actually does, not what you think it does."

---

## Wann diesen Skill nutzen?

- **VOR** jedem Refactoring (als Teil von /discovery oder standalone)
- Wenn du ein Feature/Domain komplett verstehen musst
- Wenn du "ich glaube das macht X" denkst statt "ich WEISS das macht X"
- Wenn Business-Logik "irgendwie funktioniert" aber niemand genau weiss wie

---

## Die 7 Grabungsschichten

### Schicht 1: Entry Points (Wo kommt der Request rein?)

```bash
cd C:/work/repos/Laravel-2.0

# 1. Routes die das Feature betreffen
grep -rn "{feature_keyword}" routes/ --include="*.php"

# 2. Controller-Methoden
grep -rn "{feature_keyword}" app/Http/Controllers/ --include="*.php" -l

# 3. Console Commands (Cron/Artisan)
grep -rn "{feature_keyword}" app/Console/Commands/ --include="*.php" -l

# 4. Job-Klassen (Queue-basierte Einstiegspunkte)
grep -rn "{feature_keyword}" app/Jobs/ --include="*.php" -l

# 5. Webhook-Handler / API-Callbacks
grep -rn "webhook\|callback\|{feature_keyword}" app/Http/Controllers/ --include="*.php" -l
```

**Dokumentiere:** Jeder Entry Point = ein Business-Prozess-Start.

### Schicht 2: Orchestrierung (Wer koordiniert die Logik?)

```bash
# 1. Services
grep -rn "{FeatureName}" app/Services/ --include="*.php" -l

# 2. Actions
grep -rn "{FeatureName}" app/Actions/ --include="*.php" -l

# 3. Direkte Business-Logik in Controllern (Anti-Pattern aber real)
# Suche nach Controllern die mehr als Request-Handling machen
```

**Fuer jeden Service/Action:**
1. ALLE public Methoden auflisten
2. Fuer jede Methode: Was sind die Vorbedingungen (if-Checks)?
3. Was sind die Seiteneffekte (Events, DB-Writes, API-Calls)?
4. Was wird zurueckgegeben?

### Schicht 3: Daten-Layer (Wie werden Daten gelesen/geschrieben?)

```bash
# 1. Models mit Business-Logik (Methoden die NICHT nur Relationships sind)
grep -rn "public function" app/Models/{FeatureName}.php | grep -v "relationship\|scope\|get.*Attribute\|set.*Attribute"

# 2. Scopes (versteckte Query-Logik)
grep -rn "scopeWhere\|scope[A-Z]" app/Models/{FeatureName}.php

# 3. Accessors/Mutators (Daten-Transformation)
grep -rn "get.*Attribute\|set.*Attribute\|Attribute::make" app/Models/{FeatureName}.php

# 4. Model-Casts (Typ-Konvertierung die Logik enthaelt)
grep -rn "protected \$casts\|protected function casts" app/Models/{FeatureName}.php -A 20

# 5. Boot-Methoden (Model Lifecycle Hooks)
grep -rn "protected static function boot\|static::creating\|static::updating" app/Models/{FeatureName}.php
```

**KRITISCH:** Accessors/Mutators und boot()-Methoden sind die #1 Quelle fuer "versteckte" Logik.

### Schicht 4: Side-Effects (Was passiert unsichtbar?)

```bash
# 1. Observers (reagieren auf Model-Events)
find app/Observers/ -name "*{FeatureName}*" -o -name "*Observer*" | xargs grep -l "{FeatureName}"

# 2. Events die dispatched werden
grep -rn "{FeatureName}.*dispatch\|event(.*{FeatureName}" app/ --include="*.php"

# 3. Listeners die auf diese Events reagieren
grep -rn "{FeatureName}" app/Listeners/ --include="*.php" -l

# 4. EventServiceProvider Mappings
grep -rn "{FeatureName}" app/Providers/EventServiceProvider.php

# 5. Model Events in boot() oder Observer
grep -rn "creating\|created\|updating\|updated\|deleting\|deleted\|saving\|saved" app/Observers/ --include="*.php"
```

**Dokumentiere:** Jeder Observer/Listener = ein unsichtbarer Seiteneffekt der beim Refactoring ERHALTEN bleiben muss.

### Schicht 5: Implizite Regeln (Undokumentierte Business Rules)

Das ist die SCHWIERIGSTE Schicht. Hier steckt das implizite Wissen.

```bash
# 1. Bedingungen/Guards (if-Statements mit Business-Bedeutung)
grep -rn "if.*status\|if.*type\|if.*role\|if.*is[A-Z]" app/Services/*{FeatureName}* --include="*.php"

# 2. Validation Rules (definieren was gueltig ist)
grep -rn "{feature_keyword}" app/Http/Requests/ --include="*.php" -l
# Dann: JEDE Rule lesen – sie dokumentieren Business-Constraints

# 3. Config-basierte Regeln
grep -rn "{feature_keyword}" config/ --include="*.php"

# 4. Hardcoded Magic Numbers/Strings
grep -rn "== [0-9]\|=== [0-9]\|== '\|=== '" app/Services/*{FeatureName}* --include="*.php"

# 5. Helper-Funktionen die Business-Logik enthalten
grep -rn "{feature_keyword}" app/helpers/ --include="*.php"
grep -rn "{feature_keyword}" app/Helpers/ --include="*.php"
```

**Fuer jede gefundene Bedingung frage:**
- WARUM existiert diese Bedingung?
- Was passiert wenn sie NICHT erfuellt ist?
- Ist das eine Business Rule oder eine technische Absicherung?
- Wer hat diese Regel definiert? (git blame)

### Schicht 6: Frontend-Logik (Was macht das UI?)

```bash
# 1. Vue-Komponenten mit Business-Logik
grep -rn "{feature_keyword}" resources/js/ --include="*.vue" --include="*.js" -l

# 2. Blade-Templates mit Logik
grep -rn "@if.*{feature_keyword}\|@can.*{feature_keyword}" resources/views/ --include="*.blade.php"

# 3. Frontend-Validation (dupliziert Backend?)
grep -rn "rules\|validate\|required" resources/js/ --include="*.vue" | grep -i "{feature_keyword}"

# 4. API-Calls (welche Endpoints nutzt das Frontend?)
grep -rn "axios\|fetch\|api/" resources/js/ --include="*.vue" --include="*.js" | grep -i "{feature_keyword}"
```

**KRITISCH:** Logik die NUR im Frontend existiert = Risiko. Muss ins Backend migriert werden.

### Schicht 7: Externe Abhaengigkeiten (Was geht raus?)

```bash
# 1. Externe API-Calls
grep -rn "Http::get\|Http::post\|Guzzle\|curl" app/Services/*{FeatureName}* --include="*.php"

# 2. Payment/Service Integrationen
grep -rn "Mollie\|Wise\|Zendesk\|Google\|Timocom\|Meilisearch" app/Services/*{FeatureName}* --include="*.php"

# 3. Notification Channels
grep -rn "{feature_keyword}" app/Notifications/ --include="*.php" -l

# 4. Mail
grep -rn "{feature_keyword}" app/Mail/ --include="*.php" -l

# 5. Queue Jobs (async Verarbeitung)
grep -rn "{feature_keyword}" app/Jobs/ --include="*.php" -l
```

---

## Output: Logic Map

```markdown
# Logic Map: {Feature/Domain}
Datum: {YYYY-MM-DD}

## 1. Entry Points
| # | Typ | Datei:Zeile | Methode | Trigger |
|---|-----|-----------|---------|---------|
| 1 | Route | routes/api.php:42 | POST /api/v2/orders | User-Request |
| 2 | Command | app/Console/Commands/ProcessOrders.php | handle() | Cron taeglich 6:00 |
| 3 | Job | app/Jobs/RecalculatePrice.php | handle() | Queue nach Order-Update |

## 2. Logik-Verteilung
| Layer | Datei | Methoden mit Business-Logik | LOC |
|-------|-------|-----------------------------|-----|
| Controller | OrderController.php | store(), update() | 45 |
| Service | OrderService.php | createOrder(), calculatePrice() | 320 |
| Model | Order.php | getStatusLabel(), canBeCancelled() | 85 |
| Observer | OrderObserver.php | created(), updated() | 60 |
| Helper | functions.php | formatOrderNumber(), getZone() | 40 |
| Vue | OrderForm.vue | validateTimeRules(), calculateEstimate() | 120 |

## 3. Unsichtbare Side-Effects
| Trigger | Event/Observer | Was passiert | Wo |
|---------|---------------|--------------|-----|
| Order::create() | OrderObserver::created | Sendet Notification an Fahrer | Listener: NotifyDriver |
| Order::update(status) | OrderObserver::updated | Aktualisiert Invoice | Listener: UpdateInvoice |
| order.completed event | CompleteOrderListener | Berechnet Provision | app/Listeners/ |

## 4. Implizite Business Rules (KRITISCH)
| # | Regel | Wo gefunden | Dokumentiert? | Begruendung |
|---|-------|-------------|---------------|-------------|
| 1 | Orders ueber 500EUR brauchen Manager-Freigabe | OrderService:234 | NEIN | if($total > 500) |
| 2 | Samstags-Zustellung kostet 50% Aufschlag | helpers/functions.php:89 | NEIN | Hardcoded in getZone() |
| 3 | Express-Orders muessen innerhalb 2h zugestellt werden | OrderValidator:45 | JA (in Validation) | |

## 5. Frontend-Only Logik (MIGRIEREN!)
| Logik | Vue-Komponente | Zeile | Backend-Aequivalent? |
|-------|---------------|-------|---------------------|
| Preis-Kalkulation | OrderForm.vue:120 | calculateEstimate() | NEIN – nur Frontend! |
| Zeitfenster-Validation | TimeRules.vue:45 | checkAvailability() | Teilweise in OrderService |

## 6. Externe Abhaengigkeiten
| Service | Wo aufgerufen | Was passiert bei Ausfall? | Timeout? |
|---------|--------------|--------------------------|---------|
| Mollie | PaymentService:67 | Order bleibt "pending" | 30s |
| Google Maps | ZoneService:23 | Fallback auf Postleitzahl | 10s |

## 7. Vollstaendige Execution Map (kritischster Pfad)
```
POST /api/v2/orders
  → Middleware: auth, throttle
  → OrderController@store
    → OrderRequest (Validation: 15 Rules)
    → OrderService->createOrder()
      → Zone::calculate() [Helper]
      → PricingStrategy->calculate() [Strategy Pattern]
        → TariffService->getTariff() [DB]
        → SurchargeCalculator->apply() [Samstag, Express, Gewicht]
      → Order::create() [Model]
        → OrderObserver::creating [setzt order_number]
        → OrderObserver::created [dispatched OrderCreated]
          → Listener: SendConfirmation [Mail]
          → Listener: NotifyDispatcher [Pusher]
          → Listener: SyncToMeilisearch [Search]
      → MollieService->createPayment() [External]
    → return OrderResource [Response]
```

## 8. Risiko-Bewertung
| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|-------------------|--------|-----------|
| Observer-Logik vergessen | HOCH | Order-Notifications fehlen | Characterization Tests |
| Frontend-Logik nicht migriert | MITTEL | Preis-Differenzen | Backend-First Rule |
| Hardcoded Business Rules | HOCH | Falsche Preise/Zeiten | Explizit in Config auslagern |
```

---

## Qualitaets-Check: Ist die Logic Map vollstaendig?

Beantworte diese Fragen. Wenn eine mit "Nein" oder "Unsicher" beantwortet wird: WEITER GRABEN.

| # | Frage | Antwort |
|---|-------|---------|
| 1 | Kann ich den KOMPLETTEN Datenfluss von Request bis Response nachzeichnen? | |
| 2 | Kenne ich ALLE Side-Effects (Events, Observers, Notifications)? | |
| 3 | Gibt es Business-Logik die NUR im Frontend existiert? | |
| 4 | Gibt es hardcoded Werte die Business Rules darstellen? | |
| 5 | Gibt es Cron-Jobs oder Queue-Jobs die dieses Feature triggern? | |
| 6 | Gibt es externe API-Calls die fehlschlagen koennten? | |
| 7 | Kann ich JEDE if-Bedingung in den Services erklaeren? | |
| 8 | Gibt es Validation Rules die Business-Constraints ausdruecken? | |
