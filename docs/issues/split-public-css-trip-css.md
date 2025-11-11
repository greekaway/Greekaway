# Split Proposal: public/css/trip.css

Path: `public/css/trip.css`
Size: 22,632 bytes
Lines: 498
Type: page-specific styles

## Why Split
Combines layout, component styling, and overrides; reduces specificity conflicts if separated.

## Proposed Structure
- `public/css/trip.layout.css`
- `public/css/trip.components.css`

## Checklist
- [ ] Identify layout vs component sections
- [ ] Copy to new files retaining order
- [ ] Update HTML includes order
- [ ] Visual regression check

## Difficulty
Low

## Risks
Cascade/override ordering shifts.
