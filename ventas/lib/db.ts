import { Pool, types } from "pg";

// numeric y bigint llegan como texto; aquí son montos y conteos pequeños
types.setTypeParser(1700, parseFloat);
types.setTypeParser(20, Number);

const g = globalThis as unknown as { pool?: Pool };
export const db = (g.pool ??= new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://panda:panda@localhost:5441/panda_oltp",
}));

export async function q<T = Record<string, any>>(sql: string, valores: unknown[] = []): Promise<T[]> {
  return (await db.query(sql, valores)).rows as T[];
}
