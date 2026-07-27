export async function maybeProxyCustody(request: Request) {
  const backend = process.env.SOLCAGE_CUSTODY_BACKEND_URL?.trim();
  if (!backend || request.headers.get("x-solcage-custody-proxy") === "1") return null;
  const incoming = new URL(request.url);
  const target = new URL(`${incoming.pathname}${incoming.search}`, backend);
  if (target.origin === incoming.origin) return null;
  const headers = new Headers();
  for (const name of ["content-type", "cookie", "idempotency-key"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("x-solcage-custody-proxy", "1");
  const response = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.arrayBuffer(),
    redirect: "manual",
  });
  const outgoing = new Headers(response.headers);
  outgoing.delete("content-encoding");
  outgoing.delete("content-length");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: outgoing,
  });
}

