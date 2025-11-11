# Split Proposal: public/css/style.css

Path: `public/css/style.css`
Size: 46,851 bytes
Lines: 1,383
Type: global styles

## Why Split
Large catch‑all with resets, layout rules, components, utilities. Hard to navigate and reason about specificity.

## Proposed Structure (Phase 1 PoC)
- `public/css/style.base.css` (reset, typography, color vars)
- `public/css/style.layout.css` (grid, flex, spacing)
- Phase 2: `public/css/style.components.css` (buttons, forms)

## Checklist
- [ ] Identify first 2 logical segments
- [ ] Copy segments into new files (non-destructive)
- [ ] Include both new files before original (or replace original) in HTML
- [ ] Visual smoke test app pages
- [ ] Remove duplicated blocks later (follow-up PR)

## Difficulty
Low

## Risks
Cascade ordering, potential override loss if order changes.
