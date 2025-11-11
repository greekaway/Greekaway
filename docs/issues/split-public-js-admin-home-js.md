# Split Proposal: public/js/admin-home.js

Path: `public/js/admin-home.js`
Size: 23,880 bytes
Lines: 548
Type: frontend admin dashboard

## Why Split
Mixes DOM selection, API calls, state management; improves testability and readability if modularized.

## Proposed Structure
- `public/js/admin/home/index.js`
- `public/js/admin/home/dom.js`
- `public/js/admin/home/api.js`

## Checklist
- [ ] Inventory UI functions
- [ ] Separate pure state logic
- [ ] Abstract API endpoints
- [ ] Smoke test dashboard features

## Difficulty
Medium

## Risks
Script load order and global state dependencies.
