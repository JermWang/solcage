import type { PoolClient } from "pg";

export async function awardPoints(
  client: PoolClient,
  input: {
    userId: string;
    kind: string;
    basePoints: number;
    description: string;
    eventKey: string;
    metadata?: Record<string, unknown>;
  },
) {
  const user = await client.query("SELECT referred_by FROM users WHERE id = $1", [input.userId]);
  if (!user.rowCount) throw new Error("User not found");
  const referredBy = user.rows[0].referred_by as string | null;
  const multiplier = referredBy ? 1.25 : 1;
  const points = Math.max(0, Math.floor(input.basePoints * multiplier));
  const inserted = await client.query(
    `INSERT INTO reward_ledger
     (id, user_id, kind, base_points, multiplier, points, description, event_key, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     ON CONFLICT (event_key) DO NOTHING RETURNING points`,
    [
      crypto.randomUUID(),
      input.userId,
      input.kind,
      input.basePoints,
      multiplier,
      points,
      input.description,
      input.eventKey,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  if (!inserted.rowCount) return { awarded: 0, duplicate: true };

  if (referredBy) {
    const referralPoints = Math.max(1, Math.floor(input.basePoints * 0.1));
    await client.query(
      `INSERT INTO reward_ledger
       (id, user_id, kind, base_points, multiplier, points, description, event_key, metadata)
       VALUES ($1, $2, 'referral_bonus', $3, 1, $3, 'Referral activity bonus', $4, $5::jsonb)
       ON CONFLICT (event_key) DO NOTHING`,
      [
        crypto.randomUUID(),
        referredBy,
        referralPoints,
        `referral:${input.eventKey}`,
        JSON.stringify({ referredUserId: input.userId, sourceKind: input.kind }),
      ],
    );
  }
  return { awarded: points, duplicate: false };
}
