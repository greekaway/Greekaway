# Split Proposal: public/css/booking.css

Path: `public/css/booking.css`
Size: 44,282 bytes
Lines: 864
Type: page-specific styles

## Why Split
Large stylesheet combining base, components, and overrides; maintainability suffers.

## Proposed Structure
- `public/css/booking.base.css`
- `public/css/booking.components.css`
- `public/css/booking.overrides.css`

## Checklist
- [ ] Identify logical sections
- [ ] Create split files
- [ ] Update HTML include order
- [ ] Visual regression check

## Difficulty
Low

## Risks
Specificity/order changes.
