import pg from "pg";
import { hashPassword } from "../../src/lib/auth/password";

/**
 * Inserts a PLATFORM_ADMIN user when env vars are set and no active admin exists.
 */
export async function seedPlatformAdmin(client: pg.Client): Promise<void> {
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.PLATFORM_ADMIN_PASSWORD?.trim();

  if (!email || !password) {
    console.log(
      "skip platform admin seed: set PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD to create an admin user",
    );
    return;
  }

  const existing = await client.query<{ id: string }>(
    `SELECT id FROM public.users
     WHERE role = 'PLATFORM_ADMIN' AND deleted_at IS NULL
     LIMIT 1`,
  );
  if (existing.rows.length > 0) {
    console.log("skip platform admin seed: PLATFORM_ADMIN user already exists");
    return;
  }

  const emailTaken = await client.query<{ id: string }>(
    `SELECT id FROM public.users
     WHERE lower(email) = lower($1) AND deleted_at IS NULL
     LIMIT 1`,
    [email],
  );
  if (emailTaken.rows.length > 0) {
    console.warn(
      `skip platform admin seed: email ${email} already in use (not PLATFORM_ADMIN)`,
    );
    return;
  }

  const passwordHash = await hashPassword(password);
  const name =
    process.env.PLATFORM_ADMIN_NAME?.trim() || email.split("@")[0] || "Admin";

  await client.query(
    `INSERT INTO public.users (email, password_hash, name, role, tenant_id)
     VALUES ($1, $2, $3, 'PLATFORM_ADMIN', NULL)`,
    [email, passwordHash, name],
  );

  console.log(`seeded platform admin: ${email}`);
}
