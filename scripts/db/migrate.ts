/**
 * Applies SQL migrations in supabase/migrations/ (ordered by filename).
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npx tsx scripts/db/migrate.ts
 *
 * Skips Supabase-only file 20260514120000_tenant_auth_membership.sql when
 * 20260514120000_tenant_auth_membership_aws.sql is present (use _aws on fresh RDS).
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

const SKIP_ON_AWS = new Set([
  "20260514120000_tenant_auth_membership.sql",
]);

const AWS_REPLACEMENTS = new Map([
  [
    "20260514120000_tenant_auth_membership.sql",
    "20260514120000_tenant_auth_membership_aws.sql",
  ],
]);

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const { rows: appliedRows } = await client.query<{ filename: string }>(
    "SELECT filename FROM public.schema_migrations ORDER BY filename",
  );
  const applied = new Set(appliedRows.map((r) => r.filename));

  for (const file of files) {
    if (SKIP_ON_AWS.has(file)) {
      const replacement = AWS_REPLACEMENTS.get(file);
      if (replacement && files.includes(replacement)) {
        console.log(`skip (aws): ${file} → use ${replacement}`);
        continue;
      }
    }
    if (applied.has(file)) {
      console.log(`skip (applied): ${file}`);
      continue;
    }

    const fullPath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(fullPath, "utf8");
    console.log(`apply: ${file}`);
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO public.schema_migrations (filename) VALUES ($1)",
        [file],
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      console.error(`failed: ${file}`, e);
      process.exit(1);
    }
  }

  await client.end();
  console.log("migrations complete");
}

void main();
