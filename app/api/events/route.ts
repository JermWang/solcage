import { json, requireIdentity } from "@/lib/identity";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const identity = await requireIdentity(request);
    return json(
      {
        error: "Direct client activity submissions are disabled. Use verified game or on-chain protocol settlement.",
      },
      410,
      identity,
    );
  } catch {
    return json({ error: "Unable to verify identity" }, 400);
  }
}
