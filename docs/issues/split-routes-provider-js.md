# Split Proposal: routes/provider.js

Path: `routes/provider.js`
Size: 39,931 bytes
Lines: 808
Type: backend route

## Why Split
Multiple responsibilities (auth, business logic, DB, response building) in one file.

## Proposed Structure
- `src/routes/provider/index.js`
- `src/routes/provider/handlers/*.js`
- `src/services/providerService.js`

## Checklist
- [ ] Inventory route handlers
- [ ] Extract service functions
- [ ] Move handlers by domain
- [ ] Update imports in `server.js`
- [ ] Add unit tests for services

## Difficulty
Medium

## Risks
Circular deps between services; ensure shared DB handle passed explicitly.
