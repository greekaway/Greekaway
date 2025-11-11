# Split Proposal: routes/provider-availability.js

Path: `routes/provider-availability.js`
Size: 13,438 bytes
Lines: 318
Type: backend route

## Why Split
Availability computation entangled with HTTP concerns; isolation improves performance testing.

## Proposed Structure
- `src/routes/provider/availability.js`
- `src/services/provider/availabilityService.js`

## Checklist
- [ ] Extract pure availability logic
- [ ] Add service layer
- [ ] Unit test service outputs
- [ ] Update route registration

## Difficulty
Low

## Risks
Caching changes; ensure response schema identical.
