import { Router, type IRouter, type Request } from "express";
import { createHash } from "crypto";
import { eq, and, sql, desc } from "drizzle-orm";
import { db, matchupSuggestionsTable, suggestionVotesTable } from "@workspace/db";
import { reqT } from "../lib/i18n";

const router: IRouter = Router();

function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.ip ?? "unknown";
}

function isValidTeam(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.trim().length <= 50;
}

// GET /api/suggestions — ordered by vote count desc, with hasVoted per IP
router.get("/", async (req, res) => {
  const ipHash = hashIp(getClientIp(req));

  const rows = await db
    .select({
      id: matchupSuggestionsTable.id,
      leftTeam: matchupSuggestionsTable.leftTeam,
      rightTeam: matchupSuggestionsTable.rightTeam,
      votes: sql<number>`cast(count(${suggestionVotesTable.id}) as int)`,
    })
    .from(matchupSuggestionsTable)
    .leftJoin(
      suggestionVotesTable,
      eq(matchupSuggestionsTable.id, suggestionVotesTable.suggestionId),
    )
    .groupBy(matchupSuggestionsTable.id)
    .orderBy(desc(sql`count(${suggestionVotesTable.id})`));

  // Check which ones the current IP has voted on
  const myVotes = await db
    .select({ suggestionId: suggestionVotesTable.suggestionId })
    .from(suggestionVotesTable)
    .where(eq(suggestionVotesTable.ipHash, ipHash));

  const votedSet = new Set(myVotes.map((v) => v.suggestionId));

  const result = rows.map((r) => ({
    ...r,
    hasVoted: votedSet.has(r.id),
  }));

  res.json(result);
});

// POST /api/suggestions — create a new suggestion
router.post("/", async (req, res) => {
  const { leftTeam, rightTeam } = req.body ?? {};
  if (!isValidTeam(leftTeam) || !isValidTeam(rightTeam)) {
    res.status(400).json({ error: reqT(req, "invalidRequest") });
    return;
  }

  const inserted = await db
    .insert(matchupSuggestionsTable)
    .values({ leftTeam: leftTeam.trim(), rightTeam: rightTeam.trim() })
    .returning();

  res.status(201).json({ ...inserted[0], votes: 0, hasVoted: false });
});

// POST /api/suggestions/:id/vote — vote for a suggestion (1 per IP)
router.post("/:id/vote", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: reqT(req, "invalidSuggestionId") });
    return;
  }

  const ipHash = hashIp(getClientIp(req));

  const suggestion = await db
    .select()
    .from(matchupSuggestionsTable)
    .where(eq(matchupSuggestionsTable.id, id))
    .limit(1);

  if (suggestion.length === 0) {
    res.status(404).json({ error: reqT(req, "notFound") });
    return;
  }

  const existing = await db
    .select()
    .from(suggestionVotesTable)
    .where(
      and(
        eq(suggestionVotesTable.suggestionId, id),
        eq(suggestionVotesTable.ipHash, ipHash),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    res.json({ accepted: false, reason: "already_voted" });
    return;
  }

  await db.insert(suggestionVotesTable).values({ suggestionId: id, ipHash });

  res.json({ accepted: true });
});

export default router;
