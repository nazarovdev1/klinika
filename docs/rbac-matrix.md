# RBAC matrix

Source of truth: `ROLE_PERMISSIONS` in `packages/contracts/src/permissions.ts`.
Verified by `apps/api/src/__tests__/rbac.matrix.test.ts` (role x endpoint).

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

Record-level rules (`*.policy.ts`):

- Only an OWNER may create, modify, deactivate or reset the password of OWNER accounts.
- Nobody can deactivate or change the role of their own account.
- (Phase 4) DOCTOR sees/edits only own encounters; signed encounters are immutable.

Note: the brief says ADMIN is "OWNER minus billing plan and deleting clinic". Neither exists in the MVP,
so ADMIN currently has all permissions except managing OWNER accounts.
