import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { provisionTenantForUser } from "@/lib/auth/provision-tenant";
import { createSession } from "@/lib/auth/session";
import { queryOne } from "@/lib/db/postgres";

export type AuthUserRow = {
  id: string;
  email: string;
  name: string;
};

export async function findUserByEmail(
  email: string,
): Promise<(AuthUserRow & { password_hash: string }) | null> {
  return queryOne(
    `SELECT id, email, name, password_hash
     FROM public.users
     WHERE lower(email) = lower($1) AND deleted_at IS NULL`,
    [email.trim()],
  );
}

export async function signUpWithPassword(input: {
  email: string;
  password: string;
  accountName: string;
  name?: string;
}): Promise<{ user: AuthUserRow; sessionToken: string }> {
  const email = input.email.trim().toLowerCase();
  const existing = await findUserByEmail(email);
  if (existing) {
    const err = new Error("EMAIL_IN_USE");
    (err as Error & { code?: string }).code = "EMAIL_IN_USE";
    throw err;
  }

  const passwordHash = await hashPassword(input.password);
  const name =
    input.name?.trim() ||
    input.accountName.trim() ||
    email.split("@")[0] ||
    "User";

  const user = await queryOne<AuthUserRow & { password_hash: string }>(
    `INSERT INTO public.users (email, password_hash, name, role, tenant_id)
     VALUES ($1, $2, $3, 'TENANT_ADMIN', NULL)
     RETURNING id, email, name, password_hash`,
    [email, passwordHash, name],
  );
  if (!user) throw new Error("Failed to create user");

  await provisionTenantForUser(user.id, input.accountName);

  const sessionToken = await createSession(user.id);
  return {
    user: { id: user.id, email: user.email, name: user.name },
    sessionToken,
  };
}

export async function signInWithPassword(input: {
  email: string;
  password: string;
}): Promise<{ user: AuthUserRow; sessionToken: string } | null> {
  const row = await findUserByEmail(input.email);
  if (!row) return null;
  const ok = await verifyPassword(input.password, row.password_hash);
  if (!ok) return null;
  const sessionToken = await createSession(row.id);
  return {
    user: { id: row.id, email: row.email, name: row.name },
    sessionToken,
  };
}
