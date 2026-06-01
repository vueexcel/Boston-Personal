import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/session-constants";
import { query, queryOne } from "@/lib/db/postgres";

export { SESSION_COOKIE } from "@/lib/auth/session-constants";
const SESSION_DAYS = 14;

export type SessionUser = {
  id: string;
  email: string;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(userId: string): Promise<string> {
  const token = createSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(
    Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  await query(
    `INSERT INTO public.app_sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt],
  );

  return token;
}

export async function deleteSessionByToken(token: string): Promise<void> {
  await query(`DELETE FROM public.app_sessions WHERE token_hash = $1`, [
    hashToken(token),
  ]);
}

export async function getUserIdFromSessionToken(
  token: string,
): Promise<string | null> {
  const row = await queryOne<{ user_id: string }>(
    `SELECT user_id FROM public.app_sessions
     WHERE token_hash = $1 AND expires_at > now()`,
    [hashToken(token)],
  );
  return row?.user_id ?? null;
}

export async function getSessionUserFromToken(
  token: string,
): Promise<SessionUser | null> {
  const row = await queryOne<{ id: string; email: string }>(
    `SELECT u.id, u.email
     FROM public.app_sessions s
     JOIN public.users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.expires_at > now()
       AND u.deleted_at IS NULL`,
    [hashToken(token)],
  );
  if (!row) return null;
  return { id: row.id, email: row.email };
}

export async function getSessionUserFromCookies(): Promise<SessionUser | null> {
  const cookieStore = cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getSessionUserFromToken(token);
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}
