# Split Proposal: public/step3.html

Path: `public/step3.html`
Size: 22,069 bytes
Lines: 373
Type: frontend view (booking summary)

## Why Split
Large HTML with repeated patterns (summary items, payments block) benefits from partialization.

## Proposed Structure
- `views/booking/step3.html`
- `views/booking/partials/summary-items.html`
- `views/booking/partials/payment-block.html`

## Checklist
- [ ] Extract repeated blocks
- [ ] Prepare partials
- [ ] Introduce include mechanism (templating/build)
- [ ] Visual check

## Difficulty
Medium

## Risks
Requires a build/templating step or server-side include; update JS selectors accordingly.
