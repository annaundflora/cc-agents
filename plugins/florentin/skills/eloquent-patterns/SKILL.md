---
name: eloquent-patterns
description: "MongoDB/Eloquent Best Practices. Relationships, Embedding, Aggregation, Performance, Migration von SQL-Patterns."
---

# Eloquent/MongoDB Patterns fuer Zipmend

## BaseModel Setup
```php
// Alle Models MUESSEN BaseModel oder MongoDB Model extenden
use MongoDB\Laravel\Eloquent\Model as MongoModel;

class BaseModel extends MongoModel
{
    protected $connection = 'mongodb';
    // Gemeinsame Logik hier
}
```

## Relationships

### Standard Relationships (wie SQL)
```php
// HasMany
public function orders(): HasMany
{
    return $this->hasMany(Order::class);
}

// BelongsTo
public function customer(): BelongsTo
{
    return $this->belongsTo(Customer::class);
}
```

### MongoDB-spezifisch: Embedding
```php
// EmbedsMany (Dokument IN Dokument)
// Nutzen wenn: 1:N mit wenigen N, immer zusammen geladen
public function addresses(): EmbedsMany
{
    return $this->embedsMany(Address::class);
}

// EmbedsOne
public function settings(): EmbedsOne
{
    return $this->embedsOne(UserSettings::class);
}
```

### Wann Embedding vs Reference?

| Kriterium | Embedding | Reference (Relationship) |
|-----------|-----------|-------------------------|
| Zugriff | Immer zusammen geladen | Separat ladbar |
| Groesse | Klein (<100 Eintraege) | Unbegrenzt |
| Updates | Selten einzeln aktualisiert | Haeufig einzeln |
| Sharing | Gehoert zu EINEM Parent | Mehrere Parents |
| Beispiel | Adressen eines Users | Orders eines Users |

## Query Patterns

### Eager Loading (PFLICHT in Loops)
```php
// SCHLECHT: N+1
$orders = Order::all();
foreach ($orders as $order) {
    echo $order->customer->name; // +1 Query pro Order!
}

// GUT: Eager Loading
$orders = Order::with('customer')->get();
foreach ($orders as $order) {
    echo $order->customer->name; // Kein zusaetzlicher Query
}

// GUT: Nested Eager Loading
$orders = Order::with(['customer', 'items.product'])->get();
```

### Pagination (PFLICHT statt all())
```php
// SCHLECHT
$orders = Order::all(); // Laedt ALLES in Memory

// GUT
$orders = Order::paginate(25);
// ODER fuer API
$orders = Order::cursorPaginate(25);
```

### Chunk fuer Batch-Operationen
```php
// SCHLECHT: Memory-Problem bei grossen Datasets
Order::all()->each(function ($order) {
    $order->recalculate();
});

// GUT: Chunk
Order::chunk(200, function ($orders) {
    foreach ($orders as $order) {
        $order->recalculate();
    }
});

// GUT: Lazy Collection
Order::lazy()->each(function ($order) {
    $order->recalculate();
});
```

### MongoDB Aggregation Pipeline
```php
// Fuer komplexe Auswertungen
Order::raw(function ($collection) {
    return $collection->aggregate([
        ['$match' => ['status' => 'completed']],
        ['$group' => [
            '_id' => '$customer_id',
            'total' => ['$sum' => '$amount'],
            'count' => ['$sum' => 1],
        ]],
        ['$sort' => ['total' => -1]],
    ]);
});
```

## Scopes
```php
// Named Scopes fuer wiederverwendbare Queries
public function scopeActive(Builder $query): Builder
{
    return $query->where('status', 'active');
}

public function scopeCreatedBetween(Builder $query, Carbon $from, Carbon $to): Builder
{
    return $query->whereBetween('created_at', [$from, $to]);
}

// Nutzung
Order::active()->createdBetween($from, $to)->paginate(25);
```

## Casts
```php
protected $casts = [
    'amount' => 'decimal:2',
    'metadata' => 'array',        // JSON/Array Feld
    'delivered_at' => 'datetime',
    'is_express' => 'boolean',
    'status' => OrderStatus::class, // Enum Cast (PHP 8.1)
];
```

## Anti-Patterns

| Anti-Pattern | Problem | Loesung |
|-------------|---------|---------|
| `$table = 'orders'` | SQL-Syntax | `$collection = 'orders'` |
| `DB::table()->join()` | SQL JOIN | Relationships + Eager Loading |
| `whereRaw('SQL...')` | SQL Syntax | MongoDB Query Builder |
| `Model::all()` | Memory | `paginate()` oder `chunk()` |
| Lazy Loading in Loop | N+1 Queries | `with()` Eager Loading |
