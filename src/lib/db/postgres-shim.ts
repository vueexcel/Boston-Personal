/**
 * Minimal PostgREST-style client over node-pg (replaces @supabase/supabase-js server usage).
 */
import { query } from "@/lib/db/postgres";

type Filter =
  | { kind: "eq"; col: string; val: unknown }
  | { kind: "is"; col: string; val: null }
  | { kind: "in"; col: string; vals: unknown[] };

type Order = { col: string; ascending: boolean };

export type ShimError = { message: string; code?: string };

export type ShimResult<T> = { data: T | null; error: ShimError | null };

function toShimError(e: unknown, fallback: string): ShimError {
  if (e instanceof Error) {
    const pg = e as Error & { code?: string };
    return { message: e.message, code: pg.code };
  }
  return { message: fallback };
}

class TableQuery {
  private filters: Filter[] = [];
  private orFilters: Filter[] = [];
  private orderBy: Order | null = null;
  private limitN: number | null = null;
  private selectCols = "*";
  private insertRow: Record<string, unknown> | null = null;
  private updatePatch: Record<string, unknown> | null = null;
  private mode: "select" | "insert" | "update" = "select";

  constructor(private readonly table: string) {}

  select(cols: string): this {
    this.selectCols = cols;
    return this;
  }

  insert(row: Record<string, unknown>): this {
    this.mode = "insert";
    this.insertRow = row;
    return this;
  }

  update(patch: Record<string, unknown>): this {
    this.mode = "update";
    this.updatePatch = patch;
    return this;
  }

  eq(col: string, val: unknown): this {
    this.filters.push({ kind: "eq", col, val });
    return this;
  }

  is(col: string, val: null): this {
    this.filters.push({ kind: "is", col, val });
    return this;
  }

  in(col: string, vals: unknown[]): this {
    this.filters.push({ kind: "in", col, vals });
    return this;
  }

  /** PostgREST-style OR, e.g. `agent_id.is.null,agent_id.eq.<uuid>` */
  or(expr: string): this {
    for (const part of expr.split(",")) {
      const trimmed = part.trim();
      if (trimmed.endsWith(".is.null")) {
        const col = trimmed.slice(0, -".is.null".length);
        this.orFilters.push({ kind: "is", col, val: null });
      } else {
        const eqIdx = trimmed.indexOf(".eq.");
        if (eqIdx > 0) {
          const col = trimmed.slice(0, eqIdx);
          const val = trimmed.slice(eqIdx + 4);
          this.orFilters.push({ kind: "eq", col, val });
        }
      }
    }
    return this;
  }

  order(col: string, opts: { ascending: boolean }): this {
    this.orderBy = { col, ascending: opts.ascending };
    return this;
  }

  limit(n: number): this {
    this.limitN = n;
    return this;
  }

  private buildWhere(startIdx: number): { sql: string; params: unknown[] } {
    const params: unknown[] = [];
    let idx = startIdx;
    const parts: string[] = [];
    for (const f of this.filters) {
      if (f.kind === "eq") {
        parts.push(`${f.col} = $${idx++}`);
        params.push(f.val);
      } else if (f.kind === "is") {
        parts.push(`${f.col} IS NULL`);
      } else if (f.kind === "in") {
        if (f.vals.length === 0) {
          parts.push("FALSE");
        } else {
          const placeholders = f.vals.map(() => `$${idx++}`);
          params.push(...f.vals);
          parts.push(`${f.col} IN (${placeholders.join(", ")})`);
        }
      }
    }
    let sql = parts.length ? parts.join(" AND ") : "";
    if (this.orFilters.length > 0) {
      const orParts: string[] = [];
      for (const f of this.orFilters) {
        if (f.kind === "eq") {
          orParts.push(`${f.col} = $${idx++}`);
          params.push(f.val);
        } else if (f.kind === "is") {
          orParts.push(`${f.col} IS NULL`);
        }
      }
      const orSql = `(${orParts.join(" OR ")})`;
      sql = sql ? `${sql} AND ${orSql}` : orSql;
    }
    return {
      sql: sql ? ` WHERE ${sql}` : "",
      params,
    };
  }

  async maybeSingle(): Promise<ShimResult<Record<string, unknown>>> {
    const r = await this.runSelect(1);
    if (r.error) return { data: null, error: r.error };
    const row = r.data?.[0] ?? null;
    return { data: row, error: null };
  }

  async single(): Promise<ShimResult<Record<string, unknown>>> {
    const r = await this.runSelect(1);
    if (r.error) return { data: null, error: r.error };
    const row = r.data?.[0];
    if (!row) {
      return { data: null, error: { message: "No rows returned" } };
    }
    return { data: row, error: null };
  }

  then<TResult1 = ShimResult<Record<string, unknown>[]>, TResult2 = never>(
    onfulfilled?:
      | ((value: ShimResult<Record<string, unknown>[]>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<ShimResult<Record<string, unknown>[]>> {
    if (this.mode === "insert") return this.runInsert();
    if (this.mode === "update") return this.runUpdate();
    return this.runSelect(this.limitN);
  }

  private async runSelect(
    limit: number | null,
  ): Promise<ShimResult<Record<string, unknown>[]>> {
    try {
      const cols =
        this.selectCols === "*"
          ? "*"
          : this.selectCols
              .split(",")
              .map((c) => c.trim())
              .join(", ");
      const { sql: whereSql, params } = this.buildWhere(1);
      let sql = `SELECT ${cols} FROM public.${this.table}${whereSql}`;
      if (this.orderBy) {
        sql += ` ORDER BY ${this.orderBy.col} ${this.orderBy.ascending ? "ASC" : "DESC"}`;
      }
      const lim = limit ?? this.limitN;
      if (lim != null) sql += ` LIMIT ${lim}`;
      const result = await query<Record<string, unknown>>(sql, params);
      return { data: result.rows, error: null };
    } catch (e) {
      return { data: null, error: toShimError(e, "Query failed") };
    }
  }

  private async runInsert(): Promise<ShimResult<Record<string, unknown>[]>> {
    try {
      const row = this.insertRow ?? {};
      const keys = Object.keys(row);
      const vals = keys.map((k) => row[k]);
      const placeholders = keys.map((_, i) => `$${i + 1}`);
      const cols =
        this.selectCols === "*"
          ? "*"
          : this.selectCols
              .split(",")
              .map((c) => c.trim())
              .join(", ");
      const sql = `INSERT INTO public.${this.table} (${keys.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING ${cols}`;
      const result = await query<Record<string, unknown>>(sql, vals);
      return { data: result.rows, error: null };
    } catch (e) {
      return { data: null, error: toShimError(e, "Insert failed") };
    }
  }

  private async runUpdate(): Promise<ShimResult<Record<string, unknown>[]>> {
    try {
      const patch = this.updatePatch ?? {};
      const keys = Object.keys(patch);
      const setParts = keys.map((k, i) => `${k} = $${i + 1}`);
      const params: unknown[] = keys.map((k) => patch[k]);
      const { sql: whereSql, params: whereParams } = this.buildWhere(
        keys.length + 1,
      );
      params.push(...whereParams);
      const returning =
        this.selectCols !== "*"
          ? ` RETURNING ${this.selectCols
              .split(",")
              .map((c) => c.trim())
              .join(", ")}`
          : "";
      const sql = `UPDATE public.${this.table} SET ${setParts.join(", ")}${whereSql}${returning}`;
      const result = await query<Record<string, unknown>>(sql, params);
      return { data: result.rows, error: null };
    } catch (e) {
      return { data: null, error: toShimError(e, "Update failed") };
    }
  }
}

class RpcQuery {
  constructor(
    private readonly fn: string,
    private readonly args: Record<string, unknown>,
  ) {}

  async then<TResult1 = ShimResult<Record<string, unknown>[]>, TResult2 = never>(
    onfulfilled?:
      | ((value: ShimResult<Record<string, unknown>[]>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<ShimResult<Record<string, unknown>[]>> {
    try {
      const keys = Object.keys(this.args);
      const params = keys.map((k) => this.args[k]);
      const placeholders = keys.map((_, i) => `$${i + 1}`);
      const sql = `SELECT * FROM public.${this.fn}(${placeholders.join(", ")})`;
      const result = await query<Record<string, unknown>>(sql, params);
      return { data: result.rows, error: null };
    } catch (e) {
      return { data: null, error: toShimError(e, "RPC failed") };
    }
  }
}

export type PostgresShimClient = {
  from: (table: string) => TableQuery;
  rpc: (fn: string, args: Record<string, unknown>) => RpcQuery;
};

export function createPostgresShim(): PostgresShimClient {
  return {
    from(table: string) {
      return new TableQuery(table);
    },
    rpc(fn: string, args: Record<string, unknown>) {
      return new RpcQuery(fn, args);
    },
  };
}
