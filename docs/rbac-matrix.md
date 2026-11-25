# RBAC matrix

Source of truth: `ROLE_PERMISSIONS` in `packages/contracts/src/permissions.ts`.
Verified by `apps/api/src/__tests__/rbac.matrix.test.ts` (role x endpoint).

<!-- rbac:begin -->

| Permission       | OWNER | ADMIN | REGISTRAR | DOCTOR | NURSE | CASHIER | LAB |
| ---------------- | :---: | :---: | :-------: | :----: | :---: | :-----: | :-: |
| patients:read    |   x   |   x   |     x     |   x    |   x   |    x    |  x  |
| patients:write   |   x   |   x   |     x     |        |       |         |     |
| encounters:read  |   x   |   x   |           |   x    |   x   |         |     |
| encounters:write |   x   |   x   |           |   x    |       |         |     |
| billing:read     |   x   |   x   |     x     |        |       |    x    |     |
| billing:write    |   x   |   x   |     x     |        |       |    x    |     |
| billing:refund   |   x   |   x   |           |        |       |    x    |     |
| lab:write        |   x   |   x   |           |   x    |   x   |         |  x  |
| lab:validate     |   x   |   x   |           |        |       |         |  x  |
| reports:read     |   x   |   x   |           |        |       |         |     |
| staff:manage     |   x   |   x   |           |        |       |         |     |
| settings:manage  |   x   |   x   |           |        |       |         |     |
| catalog:read     |   x   |   x   |     x     |   x    |   x   |    x    |  x  |
| catalog:write    |   x   |   x   |           |        |       |         |     |
| scheduling:read  |   x   |   x   |     x     |   x    |   x   |         |     |
| scheduling:write |   x   |   x   |     x     |        |       |         |     |
| queue:manage     |   x   |   x   |     x     |   x    |       |         |     |
| vitals:write     |   x   |   x   |           |   x    |   x   |         |     |

<!-- rbac:end -->

Record-level rules (`*.policy.ts`):

- Only an OWNER may create, modify, deactivate or reset the password of OWNER accounts.
- Nobody can deactivate or change the role of their own account.
- A DOCTOR only sees own appointments, only changes status of own appointments and queue tickets.
- A DOCTOR edits only own encounters; other doctors read only SIGNED encounters (read-only history). Signed encounters are immutable (corrections = addenda). Every encounter / lab-order / patient read is audited.
- Vitals (`vitals:write`): the attending doctor or any NURSE, on an open encounter only.
- Lab results are entered only by LAB / OWNER / ADMIN; validation is four-eyes (the validator differs from the person who entered the values) unless the clinic enables `settings.labSelfValidation`. Lab data is hidden from REGISTRAR and CASHIER.
- Cash payments and refunds require an open cash shift of the acting user in the invoice's branch; refunds need `billing:refund`.
- Reports contain no patient names (debts list patient ids only) and every view/export is audited.
- Public, unauthenticated routes: `GET /screen/:token` (queue screen, revocable token, no patient data) and `GET /verify/encounter/:id/:sig` (signature-checked, no patient data).

Note: the brief says ADMIN is "OWNER minus billing plan and deleting clinic". Neither exists in the MVP,
so ADMIN currently has all permissions except managing OWNER accounts.
