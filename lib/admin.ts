import { timingSafeEqual } from "node:crypto";

/**
 * Operator authentication for review queues.
 *
 * Separate from player sessions on purpose: approving a withdrawal moves real
 * money, and it should never be reachable by escalating a normal account.
 */
export class AdminRequired extends Error {
  constructor() {
    super("Operator authorisation required");
    this.name = "AdminRequired";
  }
}

export function requireAdmin(request: Request) {
  const expected = process.env.SOLCAGE_ADMIN_TOKEN;
  // An unset or short token disables the endpoint rather than leaving it open.
  if (!expected || expected.length < 32) throw new AdminRequired();

  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!presented) throw new AdminRequired();

  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which itself leaks length.
  if (a.length !== b.length) throw new AdminRequired();
  if (!timingSafeEqual(a, b)) throw new AdminRequired();
  return true;
}

export function isAdminRequired(error: unknown) {
  return typeof error === "object" && error !== null && (error as Error).name === "AdminRequired";
}
