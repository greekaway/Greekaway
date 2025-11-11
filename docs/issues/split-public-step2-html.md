# Split Proposal: public/step2.html

Path: `public/step2.html`
Size: 34,523 bytes
Lines: 654
Type: frontend view (booking step)

## Why Split
Large static HTML with repetitive form and addon markup; difficult to maintain and localize.

## Proposed Structure
- `views/booking/step2.html`
- `views/booking/partials/guest-form.html`
- `views/booking/partials/addons.html`

## Checklist
- [ ] Identify repeated blocks
- [ ] Create partials directory
- [ ] Move blocks into partials
- [ ] Introduce include mechanism (templating or build step) — follow-up
- [ ] Verify DOM IDs remain stable

## Difficulty
Medium

## Risks
If no templating layer exists, may need new build step; risk of breaking JS selectors.
