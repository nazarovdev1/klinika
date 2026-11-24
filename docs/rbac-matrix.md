# RBAC matrix

Roles: OWNER, ADMIN, REGISTRAR, DOCTOR, NURSE, CASHIER, LAB.
Permission strings are defined in `packages/contracts/src/permissions.ts`.

The role → permission mapping is written in **Phase 1** together with the table-driven `rbac.matrix` test.
This file is then generated/kept in sync with the code.
