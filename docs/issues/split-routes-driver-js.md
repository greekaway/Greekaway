# Split Proposal: routes/driver.js

Path: `routes/driver.js`
Size: 28,119 bytes
Lines: 532
Type: backend route

## Why Split
Combines auth, driver status updates, route listing, and validation in one file.

## Proposed Structure
- `src/routes/driver/index.js`
- `src/routes/driver/handlers/*.js`
- `src/services/driverService.js`

## Checklist
- [ ] Enumerate endpoints
- [ ] Extract services
- [ ] Unit test core functions
- [ ] Update `server.js` route registration

## Difficulty
Low-Medium

## Risks
Token handling and session middleware coupling.
