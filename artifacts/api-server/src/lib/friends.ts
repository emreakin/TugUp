import { and, eq, inArray, or } from "drizzle-orm";
import { db, friendshipsTable, usersTable } from "@workspace/db";

export function friendshipPair(userA: string, userB: string) {
  return userA < userB
    ? { userLowId: userA, userHighId: userB }
    : { userLowId: userB, userHighId: userA };
}

export async function areFriends(userA: string, userB: string): Promise<boolean> {
  const pair = friendshipPair(userA, userB);
  const rows = await db
    .select({ id: friendshipsTable.id })
    .from(friendshipsTable)
    .where(
      and(
        eq(friendshipsTable.userLowId, pair.userLowId),
        eq(friendshipsTable.userHighId, pair.userHighId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function addFriendship(userA: string, userB: string) {
  if (userA === userB) return false;
  const pair = friendshipPair(userA, userB);
  const existing = await db
    .select({ id: friendshipsTable.id })
    .from(friendshipsTable)
    .where(
      and(
        eq(friendshipsTable.userLowId, pair.userLowId),
        eq(friendshipsTable.userHighId, pair.userHighId),
      ),
    )
    .limit(1);
  if (existing.length > 0) return true;
  await db.insert(friendshipsTable).values(pair);
  return true;
}

export async function listFriends(userId: string) {
  const rows = await db
    .select({
      friendshipId: friendshipsTable.id,
      userLowId: friendshipsTable.userLowId,
      userHighId: friendshipsTable.userHighId,
      createdAt: friendshipsTable.createdAt,
    })
    .from(friendshipsTable)
    .where(
      or(eq(friendshipsTable.userLowId, userId), eq(friendshipsTable.userHighId, userId)),
    );

  const friendIds = rows.map((r) => (r.userLowId === userId ? r.userHighId : r.userLowId));
  if (friendIds.length === 0) return [];

  const users = friendIds.length
    ? await db
        .select({
          id: usersTable.id,
          displayName: usersTable.displayName,
          friendCode: usersTable.friendCode,
        })
        .from(usersTable)
        .where(inArray(usersTable.id, friendIds))
    : [];

  const byId = new Map(users.map((u) => [u.id, u]));
  return friendIds
    .map((id) => byId.get(id))
    .filter((u): u is NonNullable<typeof u> => !!u);
}

export async function removeFriendship(userId: string, friendId: string) {
  const pair = friendshipPair(userId, friendId);
  await db
    .delete(friendshipsTable)
    .where(
      and(
        eq(friendshipsTable.userLowId, pair.userLowId),
        eq(friendshipsTable.userHighId, pair.userHighId),
      ),
    );
}
