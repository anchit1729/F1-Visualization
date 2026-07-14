# Replay schema evolution

The demo uses `schemaVersion: 1` for catalogs, replay indexes, and chunks.

- Parsers reject unknown versions rather than guessing.
- Removing, renaming, or changing the meaning or unit of a field requires a new major schema version.
- New required fields require a new major schema version. Optional additive fields may remain in the current version only after all strict parsers are updated together.
- Published artifacts are immutable. A transformation change emits new hashes and a new `transformationVersion` even when the schema version is unchanged.
- Migrations belong at the ingestion boundary. Playback code consumes only the current normalized contract.
- TypeScript validates semantic relationships that JSON Schema cannot express concisely, including ordered samples, unique IDs, references, and timeline bounds.
