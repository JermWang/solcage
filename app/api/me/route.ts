import { db } from "@/lib/db";
import { json, profileSnapshot, requireIdentity } from "@/lib/identity";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const identity = await requireIdentity(request);
    return json(await profileSnapshot(identity.userId), 200, identity);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Profile unavailable" }, 503);
  }
}

export async function PATCH(request: Request) {
  try {
    const identity = await requireIdentity(request);
    const body = await request.json() as Record<string, unknown>;
    const displayName = String(body.displayName ?? "").trim();
    const username = String(body.username ?? "").trim().toLowerCase();
    const bio = String(body.bio ?? "").trim();
    const walletAddress = String(body.walletAddress ?? "").trim();
    const avatarUrl = String(body.avatarUrl ?? "").trim();
    if (displayName.length < 2 || displayName.length > 40) return json({ error: "Display name must be 2–40 characters" }, 400, identity);
    if (!/^[a-z0-9_]{3,24}$/.test(username)) return json({ error: "Username must be 3–24 letters, numbers, or underscores" }, 400, identity);
    if (bio.length > 180) return json({ error: "Bio is too long" }, 400, identity);
    if (walletAddress && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) return json({ error: "Enter a valid Solana wallet address" }, 400, identity);
    const isImage = avatarUrl === "" || /^https:\/\/.{1,990}$/i.test(avatarUrl) || /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]{1,500000}$/i.test(avatarUrl);
    if (!isImage) return json({ error: "Avatar must be an HTTPS image or an uploaded image under 375KB" }, 400, identity);
    await db().query(
      `UPDATE users SET username = $1, display_name = $2, bio = $3,
       wallet_address = NULLIF($4, ''), avatar_url = NULLIF($5, ''), updated_at = NOW()
       WHERE id = $6`,
      [username, displayName, bio, walletAddress, avatarUrl, identity.userId],
    );
    return json(await profileSnapshot(identity.userId), 200, identity);
  } catch (error) {
    const duplicate = typeof error === "object" && error && "code" in error && error.code === "23505";
    return json({ error: duplicate ? "That username is already taken" : "Unable to save profile" }, duplicate ? 409 : 500);
  }
}
