import { consultar, q, type Resultado } from "./db";

export type Kpi = {
  id: number;
  nombre: string;
  descripcion: string;
  unidad: string;
  tipo_medida: string;
  sentido: "mayor" | "menor";
  version: number;
  sql: string;
  grafico: string;
  origen: string;
  archivado: boolean;
};

export type KgiFila = {
  id: number;
  kpi_id: number;
  nombre: string;
  descripcion: string;
  tipo_medida: string;
  meta: number;
  valor_base: number | null;
  desde: string;
  hasta: string;
  cerrado: boolean;
};

export const TIPOS = ["monetaria", "operativa", "comercial", "calidad"];
export const GRAFICOS = ["linea", "barra", "torta", "tabla"];

const SELECCION = `
  SELECT k.id, k.nombre, k.descripcion, k.unidad, k.tipo_medida, k.sentido,
         v.version, v.sql, v.grafico, v.origen, k.archivado
  FROM ctl.kpi k JOIN ctl.kpi_version v ON v.kpi_id = k.id AND v.version = k.version_actual`;

export const kpis = () => q<Kpi>(`${SELECCION} WHERE NOT k.archivado ORDER BY k.id`);
export const archivados = () => q<Kpi>(`${SELECCION} WHERE k.archivado ORDER BY k.id`);
export const kpi = async (id: number) => (await q<Kpi>(`${SELECCION} WHERE k.id = $1`, [id]))[0];

export const kgis = (kpiId?: number) =>
  q<KgiFila>(`SELECT * FROM ctl.kgi WHERE $1::int IS NULL OR kpi_id = $1 ORDER BY cerrado, hasta`, [kpiId ?? null]);

export type Serie = Resultado & { error?: string };

/** Ejecuta el KPI; si su SQL falla, devuelve el error en vez de romper la página. */
export async function serie(k: Pick<Kpi, "sql">): Promise<Serie> {
  try {
    return await consultar(k.sql);
  } catch (e) {
    return { cols: [], filas: [], tablas: [], error: (e as Error).message };
  }
}

/** Fecha de hoy en Bolivia, 'AAAA-MM-DD'. */
export const hoy = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/La_Paz" });

export function fmt(v: number | null | undefined, unidad = ""): string {
  if (v == null) return "—";
  const n = v.toLocaleString("es-BO", { maximumFractionDigits: Math.abs(v) < 100 ? 2 : 0 });
  return unidad === "Bs" ? `Bs ${n}` : unidad ? `${n} ${unidad}` : n;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const mesCorto = (f: string) => `${MESES[Number(f.slice(5, 7)) - 1]} ${f.slice(2, 4)}`;
