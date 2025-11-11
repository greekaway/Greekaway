# Split Proposal: public/data/trips/santorini.json

Path: `public/data/trips/santorini.json`
Size: 24,729 bytes
Lines: 298
Type: content data (trip definition)

## Why Split
Rich multilingual structure; as more trips added file size and merge conflicts will grow. Logical sections (meta, stops, locale, availability) can be modular.

## Proposed Structure
- `public/data/trips/santorini/meta.json`
- `public/data/trips/santorini/stops.json`
- `public/data/trips/santorini/experience.json`
- `public/data/trips/santorini/map.json`
- `public/data/trips/santorini/schedule.json` (departure info)
- `public/data/trips/santorini/availability.json` (dates)
- `public/data/trips/santorini/locales/en.json` (one per locale)

## Checklist
- [ ] Create subdirectory `public/data/trips/santorini/`
- [ ] Split sections into dedicated files
- [ ] Provide aggregation loader (JS) to recompose original structure for consumers
- [ ] Update any fetch paths in frontend
- [ ] Verify JSON schema unchanged externally

## Difficulty
Low

## Risks
Increased HTTP requests if fetched separately; need bundling or aggregation step.
