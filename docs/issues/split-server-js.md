# Split Proposal: server.js

Path: `server.js`
Size: 151,952 bytes
Lines: 3,015
Type: backend entry

## Why Split
Monolithic server mixes app bootstrap, route registration, middleware, SSE, Stripe webhook helpers. Harder to test and onboard new contributors.

## Proposed Structure
- `src/server/index.js` (bootstrap)
- `src/server/app.js` (Express app construction)
- `src/server/routes/*.js` (domain routes)
- `src/server/webhooks/stripe.js`
- `src/server/middleware/*.js`
- `src/server/services/*.js`

## Checklist
- [ ] Create `src/server/` folder tree
- [ ] Move bootstrap logic to `index.js`
- [ ] Extract app factory to `app.js`
- [ ] Split routes by domain
- [ ] Isolate webhook logic
- [ ] Add integration tests (SSE + Stripe)
- [ ] Update imports in existing scripts
- [ ] Run full test suite

## Difficulty
Medium

## Risks
Import path churn, env ordering, SSE lifecycle.
