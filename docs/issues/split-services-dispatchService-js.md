# Split Proposal: services/dispatchService.js

Path: `services/dispatchService.js`
Size: 11,849 bytes
Lines: 246
Type: backend service

## Why Split
Dense core logic mixing grouping, route planning, and notifications.

## Proposed Structure
- `src/services/dispatch/core.js`
- `src/services/dispatch/grouping.js`
- `src/services/dispatch/notifications.js`

## Checklist
- [ ] Identify pure functions
- [ ] Extract grouping logic
- [ ] Add unit tests for core
- [ ] Update consumers to import from new modules

## Difficulty
Medium

## Risks
Implicit mutable state; cyclic dependencies if split poorly.
