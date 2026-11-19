"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { consultar, dw, enlaces, q, type Enlace, type Resultado } from "@/lib/db";
import { mensajeDeError, proponer, type RespuestaIA, type Turno } from "@/lib/ia";
import { GRAFICOS, TIPOS } from "@/lib/kpi";
import { crearSnapshot } from "@/lib/snapshot";

const txt = (v: unknown) => String(v ?? "").trim();
const de = (v: unknown, opciones: string[]) => (opciones.includes(txt(v)) ? txt(v) : opciones[0]);

// ---------- KPI: vista previa y guardado ----------

export type Vista = { ok: true; r: Resultado; enlaces: Enlace[] } | { ok: false; error: string };

/** Ejecuta el SQL con el rol de solo lectura y devuelve datos y tablas enlazadas. */
export async function previsualizar(sql: string): Promise<Vista> {
  try {
    return { ok: true, r: await consultar(sql, 500), enlaces: await enlaces() };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export type DatosKpi = {
  id?: number;            // con id: nueva versión de un KPI existente
  nombre: string;
  descripcion: string;
  unidad: string;
  tipo_medida: string;
  sentido: string;
  grafico: string;
  sql: string;
  origen: "manual" | "ia";
  nota?: string;
};

/** Guarda un KPI nuevo o una versión nueva. Solo entra SQL que el almacén acepta. */
export async function guardarKpi(d: DatosKpi): Promise<{ error: string }> {
  const sql = txt(d.sql).replace(/;\s*$/, "");
  if (!txt(d.nombre)) return { error: "Falta el nombre del indicador." };
  try {
    const r = await consultar(sql, 5);
    if (r.cols.length < 2) return { error: "La consulta debe devolver al menos dos columnas: el eje y un valor." };
  } catch (e) {
    return { error: (e as Error).message };
  }

  const c = await dw.connect();
  let id = d.id;
  try {
    await c.query("BEGIN");
    const campos = [txt(d.nombre), txt(d.descripcion), txt(d.unidad), de(d.tipo_medida, TIPOS), de(d.sentido, ["mayor", "menor"])];
    if (id) {
      await c.query(
        `UPDATE ctl.kpi SET nombre = $2, descripcion = $3, unidad = $4, tipo_medida = $5, sentido = $6,
                version_actual = version_actual + 1 WHERE id = $1`,
        [id, ...campos],
      );
    } else {
      id = (await c.query(
        `INSERT INTO ctl.kpi (nombre, descripcion, unidad, tipo_medida, sentido, version_actual)
         VALUES ($1, $2, $3, $4, $5, 1) RETURNING id`, campos)).rows[0].id;
    }
    await c.query(
      `INSERT INTO ctl.kpi_version (kpi_id, version, sql, grafico, origen, nota)
       SELECT id, version_actual, $2, $3, $4, $5 FROM ctl.kpi WHERE id = $1`,
      [id, sql, de(d.grafico, GRAFICOS), d.origen === "ia" ? "ia" : "manual", txt(d.nota)],
    );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    return { error: (e as Error).message };
  } finally {
    c.release();
  }
  redirect(`/kpi/${id}`);
}

export async function archivarKpi(fd: FormData) {
  await q(`UPDATE ctl.kpi SET archivado = true WHERE id = $1`, [Number(fd.get("id"))]);
  redirect("/");
}

export async function restaurarKpi(fd: FormData) {
  const id = Number(fd.get("id"));
  await q(`UPDATE ctl.kpi SET archivado = false WHERE id = $1`, [id]);
  redirect(`/kpi/${id}`);
}

// ---------- KGI: objetivos sobre un KPI ----------

export async function crearKgi(fd: FormData) {
  const kpiId = Number(fd.get("kpi_id"));
  await q(
    `INSERT INTO ctl.kgi (kpi_id, nombre, descripcion, tipo_medida, meta, valor_base, desde, hasta)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    // valor_base: lo que valía el indicador al abrir la operación; de ahí se mide el avance
    [kpiId, txt(fd.get("nombre")), txt(fd.get("descripcion")), de(fd.get("tipo_medida"), TIPOS),
     Number(fd.get("meta")), txt(fd.get("base")) === null ? null : Number(fd.get("base")), txt(fd.get("desde")), txt(fd.get("hasta"))],
  );
  revalidatePath("/");
  redirect(`/kpi/${kpiId}#objetivos`);
}

export async function cerrarKgi(fd: FormData) {
  const [k] = await q(`UPDATE ctl.kgi SET cerrado = NOT cerrado WHERE id = $1 RETURNING kpi_id`, [Number(fd.get("id"))]);
  redirect(`/kpi/${k.kpi_id}#objetivos`);
}

// ---------- ETL ----------

export async function ejecutarEtl() {
  await q(`SELECT ctl.etl_ejecutar('manual')`);
  revalidatePath("/etl");
}

export async function configurarEtl(fd: FormData) {
  await q(`UPDATE ctl.etl_config SET intervalo_min = $1, activo = $2`,
    [Math.max(1, Math.trunc(Number(fd.get("intervalo")) || 5)), fd.get("activo") === "on"]);
  revalidatePath("/etl");
}

// ---------- snapshots ----------

/** Consolida: corre el ETL y toma la foto de todos los KPI. No mueve el turno programado. */
export async function crearSnapshotManual() {
  await crearSnapshot("manual");
  revalidatePath("/", "layout");
}

export async function configurarSnapshot(fd: FormData) {
  await q(`UPDATE ctl.snapshot_config SET dia_mes = $1, activo = $2`,
    [Math.min(28, Math.max(1, Math.trunc(Number(fd.get("dia")) || 26))), fd.get("activo") === "on"]);
  revalidatePath("/etl");
}

// ---------- asistente ----------

export async function preguntar(historial: Turno[]): Promise<RespuestaIA & { enlaces?: Enlace[] }> {
  try {
    const r = await proponer(historial);
    return r.vista ? { ...r, enlaces: await enlaces() } : r;
  } catch (e) {
    console.error(e);
    return { texto: mensajeDeError(e), crudo: "", propuesta: null };
  }
}
