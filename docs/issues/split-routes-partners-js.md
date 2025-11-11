# Split Proposal: routes/partners.js

Path: `routes/partners.js`
Size: 38,460 bytes
Lines: 844
Type: backend route

## Why Split
Partner CRUD, payouts, dispatch logic combined; impedes isolated testing.

## Proposed Structure
- `src/routes/partners/index.js`
- `src/routes/partners/handlers/*.js`
- `src/services/partnerService.js`

## Checklist
- [ ] Map endpoints
- [ ] Group handlers (CRUD, payouts, dispatch)
- [ ] Extract partnerService functions
- [ ] Integrate with new server structure
- [ ] Add tests for payout logic

## Difficulty
Medium

## Risks
Shared validation/util functions; ensure consistent error formatting.
