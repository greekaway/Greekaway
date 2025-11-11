# Split Proposal: routes/admin-suppliers.js

Path: `routes/admin-suppliers.js`
Size: 23,981 bytes
Lines: 396
Type: backend admin route

## Why Split
Administrative supplier filtering, payout status logic, and listing contained in one module.

## Proposed Structure
- `src/routes/admin/suppliers/index.js`
- `src/routes/admin/suppliers/handlers/*.js`
- `src/services/supplierAdminService.js`

## Checklist
- [ ] Identify handlers (list, filter, payout status)
- [ ] Extract service
- [ ] Add test for payout status filtering
- [ ] Update registration in `server.js`

## Difficulty
Low-Medium

## Risks
Query performance changes; ensure indices used consistently.
