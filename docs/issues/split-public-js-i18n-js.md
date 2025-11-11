# Split Proposal: public/js/i18n.js

Path: `public/js/i18n.js`
Size: 15,344 bytes
Lines: 344
Type: frontend i18n loader

## Why Split
Combines fetching, DOM applying, and formatting; modularity eases caching and testing.

## Proposed Structure
- `public/js/i18n/core.js`
- `public/js/i18n/dom.js`
- `public/js/i18n/loader.js`

## Checklist
- [ ] Identify pure formatting functions
- [ ] Separate DOM mutation code
- [ ] Async loader abstraction
- [ ] Unit tests for formatting

## Difficulty
Low

## Risks
Potential race conditions if load order changes.
