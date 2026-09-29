import { AsyncLocalStorage } from "node:async_hooks";

export interface BoundRequestContext {
  ipAddress: string | null;
  userAgent: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
}

const storage = new AsyncLocalStorage<BoundRequestContext>();

export function bindRequestContext(ctx: BoundRequestContext): void {
  storage.enterWith(ctx);
}

export function currentRequestContext(): BoundRequestContext | null {
  return storage.getStore() ?? null;
}
