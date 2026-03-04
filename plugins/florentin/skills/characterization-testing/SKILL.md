---
name: characterization-testing
description: "Feathers' Legacy Code Change Algorithm fuer Laravel. Schreibt Tests die das AKTUELLE Verhalten dokumentieren – nicht das gewuenschte. Das Sicherheitsnetz das 80% auf 95% hebt."
---

# Characterization Testing – Verhalten dokumentieren vor dem Refactoring

> **Michael Feathers:** "Legacy code is simply code without tests."
> **Sein Algorithmus:** 1. Identify change points → 2. Find test points → 3. Break dependencies
> → 4. Write characterization tests → 5. Make changes → 6. Refactor

> **Characterization Test:** Ein Test der beschreibt was der Code TATSAECHLICH tut,
> nicht was er tun SOLLTE. Wenn der Test nach dem Refactoring rot wird,
> hast du Verhalten geaendert – bewusst oder unbewusst.

---

## Wann Characterization Tests schreiben?

- **IMMER** vor einem Refactoring von bestehendem Code
- **IMMER** wenn du Code aenderst den du nicht geschrieben hast
- **IMMER** wenn es keine oder wenige Tests gibt
- **IMMER** bei Code mit impliziten Business Rules

---

## Die Methode (Laravel-spezifisch)

### Phase 1: Change Points identifizieren

Welche Klassen/Methoden werden durch das Refactoring betroffen?

```
Aus der refactoring-spec.md oder Logic Map:
1. Alle Methoden die verschoben/geaendert/geloescht werden
2. Alle Methoden die von diesen aufgerufen werden
3. Alle Observer/Listener die durch Model-Changes getriggert werden
```

### Phase 2: Test Points finden

Wo kann ich das Verhalten von aussen beobachten?

```
Laravel Test Points (von einfach zu komplex):

1. HTTP-Endpoints (Feature Tests)
   → Einfachster Einstieg: Request rein, Response pruefen
   → $this->postJson('/api/v2/orders', $payload)->assertStatus(201)

2. Service-Methoden (Unit Tests)
   → Service instanziieren, Methode aufrufen, Return pruefen
   → $result = $service->calculatePrice($order); assertEquals(42.50, $result)

3. Model-Methoden (Unit Tests)
   → Model erstellen, Methode aufrufen
   → $order->canBeCancelled() → true/false je nach Status

4. Observer Side-Effects (Feature Tests)
   → Model-Operation ausfuehren, pruefen ob Side-Effect eingetreten ist
   → Order::create($data); assertDatabaseHas('notifications', [...])

5. Event/Listener Ketten (Feature Tests)
   → Event dispatchen, pruefen ob Listener-Ergebnis eintritt
   → Event::assertDispatched(OrderCreated::class)
```

### Phase 3: Dependencies brechen (wenn noetig)

Manchmal ist Code so eng gekoppelt, dass er nicht testbar ist.

```php
// PROBLEM: Service ruft externen API-Call auf
class OrderService {
    public function createOrder($data) {
        // ... Business Logik ...
        $payment = MollieService::createPayment($order); // EXTERNER CALL
        // ...
    }
}

// LOESUNG 1: Mock (schnell, fuer Characterization Tests OK)
$this->mock(MollieService::class, function ($mock) {
    $mock->shouldReceive('createPayment')->andReturn(new Payment(['id' => 'tr_test']));
});

// LOESUNG 2: Interface extrahieren (fuer langfristiges Refactoring)
interface PaymentGateway {
    public function createPayment(Order $order): Payment;
}
```

**Laravel-spezifische Dependency-Breaking Techniken:**
1. `$this->mock(Service::class)` – Service Container Mock
2. `Bus::fake()` – Jobs nicht dispatchen
3. `Event::fake()` – Events nicht dispatchen (aber pruefen ob sie gefeuert werden)
4. `Notification::fake()` – Notifications abfangen
5. `Mail::fake()` – Mails abfangen
6. `Http::fake()` – Externe HTTP-Calls mocken
7. `Queue::fake()` – Queue-Jobs abfangen

### Phase 4: Characterization Tests schreiben

**Die goldene Regel:** Du schreibst den Test, laesst ihn LAUFEN, und der TEST sagt dir
was der Code tut. Du passt den Test an die REALITAET an, nicht umgekehrt.

```php
// Schritt 1: Test schreiben mit Placeholder-Assertion
public function test_characterize_order_creation(): void
{
    $user = User::factory()->create(['role' => 'customer']);
    $payload = [
        'pickup_address' => 'Berlin, Alexanderplatz 1',
        'delivery_address' => 'Hamburg, Jungfernstieg 5',
        'weight' => 15.5,
        'type' => 'express',
    ];

    $this->actingAs($user)
        ->postJson('/api/v2/orders', $payload)
        ->assertStatus(200); // Erstmal schauen was passiert
}

// Schritt 2: Test laufen lassen → FAIL mit "Expected 200, got 201"
// Schritt 3: Test anpassen an REALITAET
//   ->assertStatus(201)
//   ->assertJsonStructure(['data' => ['id', 'status', 'price']])

// Schritt 4: Konkreten Output dokumentieren
public function test_characterize_order_creation(): void
{
    Event::fake();
    $user = User::factory()->create(['role' => 'customer']);
    $payload = [
        'pickup_address' => 'Berlin, Alexanderplatz 1',
        'delivery_address' => 'Hamburg, Jungfernstieg 5',
        'weight' => 15.5,
        'type' => 'express',
    ];

    $response = $this->actingAs($user)
        ->postJson('/api/v2/orders', $payload)
        ->assertStatus(201)
        ->assertJsonStructure([
            'data' => ['id', 'order_number', 'status', 'price', 'estimated_delivery']
        ]);

    // Dokumentiere GENAU was der Code zurueckgibt
    $data = $response->json('data');
    $this->assertEquals('pending', $data['status']); // Status ist IMMER pending nach Erstellung
    $this->assertGreaterThan(0, $data['price']);      // Preis wird berechnet
    $this->assertNotNull($data['order_number']);       // Order-Nummer wird generiert

    // Dokumentiere welche Events gefeuert werden
    Event::assertDispatched(OrderCreated::class);
    Event::assertNotDispatched(OrderCompleted::class);
}
```

### Phase 5: Edge Cases charakterisieren

Die wichtigsten Edge Cases fuer Business-Logik:

```php
// 1. GRENZWERTE (wo aendert sich das Verhalten?)
public function test_characterize_price_boundary_500_eur(): void
{
    // Was passiert bei genau 500 EUR? Braucht es Manager-Freigabe?
    $order = Order::factory()->create(['total' => 500.00]);
    // ... testen was passiert
}

public function test_characterize_price_above_500_eur(): void
{
    $order = Order::factory()->create(['total' => 500.01]);
    // ... testen was anders ist
}

// 2. STATUS-UEBERGAENGE (State Machine)
public function test_characterize_status_transitions(): void
{
    $order = Order::factory()->create(['status' => 'pending']);

    // Welche Transitions sind erlaubt?
    $order->status = 'confirmed';
    $order->save(); // Funktioniert das? Oder wirft es eine Exception?

    $order->status = 'cancelled';
    $order->save(); // Kann man von confirmed direkt auf cancelled?
}

// 3. ROLLEN-BASIERT (verschiedene User sehen/koennen verschiedenes)
public function test_characterize_order_access_as_customer(): void { /* ... */ }
public function test_characterize_order_access_as_driver(): void { /* ... */ }
public function test_characterize_order_access_as_admin(): void { /* ... */ }

// 4. ZEITABHAENGIG (Samstag, Feiertag, Express)
public function test_characterize_saturday_surcharge(): void
{
    Carbon::setTestNow(Carbon::parse('next saturday'));
    // ... Preis-Berechnung testen
}

// 5. NULL/EMPTY Werte
public function test_characterize_order_without_optional_fields(): void
{
    // Was passiert wenn optionale Felder fehlen?
}
```

---

## Characterization Test Checkliste

Vor dem Start des Refactorings muessen ALLE Haken gesetzt sein:

```markdown
## Characterization Test Coverage: {Modul}

### Happy Paths
- [ ] Hauptfunktion funktioniert (CRUD)
- [ ] Korrekte Response-Struktur
- [ ] Korrekte Status-Codes
- [ ] Events werden gefeuert
- [ ] Notifications werden gesendet

### Business Rules
- [ ] Preis-Berechnung mit bekannten Inputs -> bekannter Output
- [ ] Status-Uebergaenge (alle erlaubten)
- [ ] Status-Uebergaenge (alle VERBOTENEN)
- [ ] Rollen-basierte Zugriffe
- [ ] Grenzwerte (500 EUR, Gewicht-Limits, Zeitfenster)

### Edge Cases
- [ ] Fehlende optionale Felder
- [ ] Ungueltige Eingaben (Validation)
- [ ] Duplikate (gleiche Order nochmal?)
- [ ] Zeitabhaengige Logik (Wochenende, Feiertage)
- [ ] Externe Service-Ausfaelle (Mollie down, Google Maps down)

### Side Effects
- [ ] Observer-Aktionen (created, updated, deleted)
- [ ] Event-Listener-Ketten
- [ ] Queue-Jobs die getriggert werden
- [ ] Mails/Notifications die gesendet werden
- [ ] Externe API-Calls die gemacht werden

### Gesamt
- Tests geschrieben: ___
- Tests PASS: ___
- Verhalten dokumentiert: ___
- Bereit fuer Refactoring: JA/NEIN
```

---

## Integration in den Workflow

```
/discovery {modul}
  → Phase 1: Research (bestehendes Toolkit)
  → Phase 1.5: Logic Archaeology (NEU - diesen Skill nutzen)
  → Phase 2: Characterization Tests schreiben (NEU - dieser Skill)
  → Phase 3: Strategie
  → Phase 4: Design
  → Phase 5: Spec (inkl. Characterization Test Coverage)

/dev {modul}
  → Phase 0: Spec-Pruefung (inkl. "Characterization Tests vorhanden?")
  → Phase 1: Setup (Baseline = Characterization Tests MUESSEN PASS sein)
  → Phase 2-6: ... wie bisher
```

---

## Anti-Patterns (was du NICHT tun sollst)

1. **Characterization Tests "fixen"**: Wenn ein Test rot wird, hast du Verhalten geaendert.
   Das ist der SINN der Tests. Nicht den Test aendern, sondern verstehen WARUM.

2. **Zu wenige Tests**: 3 Tests fuer eine 500-Zeilen-Klasse sind NICHT genug.
   Faustregel: Mindestens 1 Test pro public Methode + 1 pro Business Rule.

3. **Nur Happy Path**: Edge Cases sind wo die Bugs leben.
   Mindestens 30% der Tests muessen Edge Cases abdecken.

4. **External Services nicht mocken**: Characterization Tests muessen schnell und deterministisch sein.
   IMMER Http::fake(), Mail::fake() etc. nutzen.

5. **Tests nach dem Refactoring schreiben**: Dann dokumentieren sie das NEUE Verhalten,
   nicht das alte. Der Vergleich fehlt.
