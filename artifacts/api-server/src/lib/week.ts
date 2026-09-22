/**
 * Online week identity — single source of truth for backend business logic.
 *
 * Rule: UTC Monday 00:00:00 → next UTC Monday 00:00:00
 * Clients may display remaining duration in local time, but the authoritative
 * end instant is always derived from this UTC week boundary.
 */

/** ISO date (YYYY-MM-DD) of the UTC Monday that starts the current week. */
export function currentWeekStart(now: Date = new Date()): string {
  const day = now.getUTCDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setUTCDate(monday.getUTCDate() - daysFromMonday);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

/** ISO date of the next UTC Monday (exclusive end of the current week). */
export function currentWeekEndDate(now: Date = new Date()): string {
  const start = currentWeekStart(now);
  const monday = new Date(`${start}T00:00:00.000Z`);
  monday.setUTCDate(monday.getUTCDate() + 7);
  return monday.toISOString().slice(0, 10);
}

/** Instant when the current UTC week ends (next Monday 00:00 UTC). */
export function currentWeekEndsAt(now: Date = new Date()): Date {
  return new Date(`${currentWeekEndDate(now)}T00:00:00.000Z`);
}

/** UTC calendar date YYYY-MM-DD (for daily x2 caps). */
export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
