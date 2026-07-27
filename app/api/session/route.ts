import { destroySession } from "@/lib/identity";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  try {
    const clearCookie = await destroySession(request);
    return new Response(JSON.stringify({ signedOut: true }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "set-cookie": clearCookie },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unable to sign out" }),
      { status: 500, headers: { "content-type": "application/json; charset=utf-8" } },
    );
  }
}
