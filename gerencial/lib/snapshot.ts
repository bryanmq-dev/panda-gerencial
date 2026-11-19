import { dw, q, type Celda } from "./db";
import { hoy, kpis, serie } from "./kpi";
import { programacion } from "./snapshot-reglas";

export type Foto = { version: number; cols: string[]; filas: Celda[][] };
export type SnapshotInfo = { id: number; corte: string; cuando: string; origen: string };

const CUANDO = `to_char(creado_en AT TIME ZONE 'America/La_Paz', 'DD/MM/YYYY HH24:MI')`;

export async function ultimoSnapshot(): Promise<SnapshotInfo | undefined> {
  return (await q<SnapshotInfo>(`SELECT id, corte::text corte, ${CUANDO} cuando, origen FROM ctl.snapshot ORDER BY id DESC LIMIT 1`))[0];
}

/** Lo que cada KPI valía en un snapshot: es la línea azul del tablero. */
export async function foto(snapshotId: number): Promise<Map<number, Foto>> {
  const r = await q(`SELECT kpi_id, version, cols, filas FROM ctl.snapshot_kpi WHERE snapshot_id = $1`, [snapshotId]);
  return new Map(r.map((f) => [f.kpi_id, { version: f.version, cols: f.cols, filas: f.filas }]));
}

let enCurso = false;

/**
 * Toma la foto de todos los KPI. Antes corre el ETL, para que el snapshot
 * incluya lo último que se registró. Devuelve null si ya hay otro en marcha o,
 * en un programado, si el turno de ese mes ya estaba tomado.
 */
export async function crearSnapshot(origen: "inicial" | "programado" | "manual"): Promise<number | null> {
  if (enCurso) return null;
  enCurso = true;
  try {
    await q(`SELECT ctl.etl_ejecutar($1)`, [origen === "programado" ? "programado" : "manual"]);
    const ks = await kpis();
    const series = await Promise.all(ks.map(serie));
    const dia = hoy();

    const c = await dw.connect();
    try {
      await c.query("BEGIN");
      const s = await c.query(
        `INSERT INTO ctl.snapshot (corte, periodo, origen) VALUES ($1, date_trunc('month', $1::date), $2)
         ON CONFLICT DO NOTHING RETURNING id`, [dia, origen]);
      if (!s.rowCount) { await c.query("ROLLBACK"); return null; }
      const id: number = s.rows[0].id;
      for (const [i, k] of ks.entries()) {
        if (series[i].error) continue;                 // un KPI roto no impide la foto de los demás
        await c.query(
          `INSERT INTO ctl.snapshot_kpi (snapshot_id, kpi_id, version, cols, filas) VALUES ($1, $2, $3, $4, $5)`,
          [id, k.id, k.version, JSON.stringify(series[i].cols), JSON.stringify(series[i].filas)]);
      }
      await c.query("COMMIT");
      return id;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  } finally {
    enCurso = false;
  }
}

export async function estadoSnapshots() {
  const [cfg] = await q(`SELECT dia_mes, activo FROM ctl.snapshot_config`);
  const [{ hay }] = await q(
    `SELECT EXISTS (SELECT 1 FROM ctl.snapshot WHERE origen = 'programado' AND periodo = date_trunc('month', $1::date)) hay`, [hoy()]);
  const lista = await q<SnapshotInfo>(`SELECT id, corte::text corte, ${CUANDO} cuando, origen FROM ctl.snapshot ORDER BY id DESC LIMIT 8`);
  return { dia: cfg.dia_mes as number, activo: cfg.activo as boolean, lista, ...programacion(hoy(), cfg.dia_mes, hay) };
}

/** Lo llama el temporizador: el primer snapshot y, cada mes, el programado. */
export async function snapshotTick() {
  const [{ n }] = await q(`SELECT count(*) n FROM ctl.snapshot`);
  if (n === 0) return crearSnapshot("inicial");
  const e = await estadoSnapshots();
  if (e.activo && e.vencida) return crearSnapshot("programado");
}
