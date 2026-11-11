import { Pool, types, type QueryArrayConfig, type QueryConfig } from "pg";

types.setTypeParser(1700, parseFloat);      // numeric
types.setTypeParser(20, Number);            // bigint
types.setTypeParser(1082, (v) => v);        // date: se queda como 'AAAA-MM-DD'

const g = globalThis as unknown as { dw?: Pool; ro?: Pool };

/** Conexión de la aplicación: catálogo de KPI, objetivos y control del ETL. */
export const dw = (g.dw ??= new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://panda:panda@localhost:5441/panda_dw",
}));

/**
 * Conexión para TODO SQL escrito por una persona o por el asistente.
 * El rol gerente_ro solo puede leer el esquema dw y tiene tiempo máximo por
 * consulta: la seguridad está en la base, no en revisar el texto del SQL.
 */
export const ro = (g.ro ??= new Pool({
  connectionString: process.env.DATABASE_URL_RO ?? "postgres://gerente_ro:gerente_ro@localhost:5441/panda_dw",
  max: 4,
}));

export async function q<T = Record<string, any>>(sql: string, valores: unknown[] = []): Promise<T[]> {
  return (await dw.query(sql, valores)).rows as T[];
}

export type Celda = string | number | null;
export type Resultado = { cols: string[]; filas: Celda[][]; tablas: string[] };

const celda = (v: unknown): Celda =>
  v == null ? null
  : typeof v === "number" || typeof v === "string" ? v
  : typeof v === "boolean" ? (v ? "sí" : "no")
  : v instanceof Date ? v.toISOString().slice(0, 16).replace("T", " ")
  : JSON.stringify(v);

/** Tablas que el plan de ejecución realmente toca (más fiable que leer el texto del SQL). */
function tablasDelPlan(nodo: any, acc = new Set<string>()): Set<string> {
  if (Array.isArray(nodo)) nodo.forEach((n) => tablasDelPlan(n, acc));
  else if (nodo && typeof nodo === "object") {
    if (nodo["Relation Name"]) acc.add(`${nodo["Schema"] ?? "dw"}.${nodo["Relation Name"]}`);
    Object.values(nodo).forEach((v) => tablasDelPlan(v, acc));
  }
  return acc;
}

/** Ejecuta una consulta del gerente: solo lectura, una sola sentencia, con tope de filas. */
export async function consultar(sql: string, limite = 2000): Promise<Resultado> {
  const limpio = sql.trim().replace(/;\s*$/, "");
  if (!limpio) throw new Error("La consulta está vacía.");
  const envuelta = `SELECT * FROM (\n${limpio}\n) _consulta LIMIT ${Math.trunc(limite)}`;
  const c = await ro.connect();
  try {
    await c.query("BEGIN READ ONLY");
    // queryMode extended: el protocolo extendido rechaza más de una sentencia por mensaje
    // (los tipos de pg todavía no declaran queryMode: de ahí las conversiones)
    const plan = await c.query({ text: `EXPLAIN (VERBOSE, FORMAT JSON) ${envuelta}`, queryMode: "extended" } as QueryConfig);
    const r = await c.query({ text: envuelta, rowMode: "array", queryMode: "extended" } as QueryArrayConfig);
    return {
      cols: r.fields.map((f) => f.name),
      filas: (r.rows as unknown[][]).map((f) => f.map(celda)),
      tablas: [...tablasDelPlan(plan.rows[0]["QUERY PLAN"])].sort(),
    };
  } finally {
    await c.query("ROLLBACK").catch(() => {});
    c.release();
  }
}

export type Enlace = { origen: string; destino: string; columna: string };

/** Llaves foráneas del almacén: cómo se enlazan hechos y dimensiones. */
export async function enlaces(): Promise<Enlace[]> {
  return q<Enlace>(
    `SELECT c.conrelid::regclass::text origen, c.confrelid::regclass::text destino, a.attname columna
     FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f' AND c.connamespace = 'dw'::regnamespace`,
  );
}
