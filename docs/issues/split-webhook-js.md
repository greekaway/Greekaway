# Split Proposal: webhook.js

Path: `webhook.js`
Size: 19,380 bytes
Lines: 371
Type: backend webhook handler

## Why Split
Combines Stripe webhook parsing, event dispatch, and logging; separation aids focused testing.

## Proposed Structure
- `src/webhooks/stripe/index.js`
- `src/webhooks/stripe/verify.js`
- `src/webhooks/stripe/handlers/*.js`

## Checklist
- [ ] Identify event types handled
- [ ] Extract verification logic
- [ ] Create handler modules
- [ ] Integration test with signature validation

## Difficulty
Medium

## Risks
Raw body parsing order; signature verification must remain correct.
