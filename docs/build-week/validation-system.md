# Validation System

## Status

Phase 0 implements only the shared `ValidationResult<T>` pattern and a small Trip ID validation example. It does not implement an itinerary schema or validation pipeline.

## Planned itinerary validation

Each generated itinerary will carry a schema version and immutable revision identifier. Validation will occur at the model-output boundary before persistence and again when reading historical data after schema changes.

The planned validation layers are:

1. structural schema validation for required fields and types;
2. domain rules for ordering, dates, identifiers, and internally consistent totals;
3. provenance checks for claims that require external sources;
4. rendering checks so every accepted revision can be displayed and exported; and
5. revision rules that preserve prior accepted versions.

Validation errors will be explicit, typed, and observable. Invalid output must not become the active itinerary. Live price and availability fields will require source metadata and retrieval time; absent live data will be represented as unknown, never fabricated.
