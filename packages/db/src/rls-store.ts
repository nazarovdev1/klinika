import { AsyncLocalStorage } from 'node:async_hooks';

/** Current clinic for row-level security; read by the RLS pool when a connection is checked out. */
export const clinicStore = new AsyncLocalStorage<string>();
