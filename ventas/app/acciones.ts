"use server";

import { redirect } from "next/navigation";
import { db, q } from "@/lib/db";

// Sistema transaccional mínimo: registra lo que llega, sin reglas de negocio.
const num = (v: FormDataEntryValue | null) => Number.parseFloat(String(v ?? "")) || 0;
const txt = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

/** Filas repetidas del formulario: lote1/cant1, lote2/cant2… Las vacías se ignoran. */
function filas(fd: FormData, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    lote: num(fd.get(`lote${i + 1}`)),
    cantidad: Math.trunc(num(fd.get(`cant${i + 1}`))),
    causa: txt(fd.get(`causa${i + 1}`)),
  })).filter((f) => f.lote && f.cantidad > 0);
}

export async function registrarVenta(fd: FormData) {
  // el punto de venta se elige de la lista ("123 · Tienda…"); texto libre no sirve
  const [pv] = await q(`SELECT id FROM punto_venta WHERE id = $1`, [Math.trunc(num(fd.get("punto_venta")))]);
  if (!pv) redirect("/?error=" + encodeURIComponent("Elija un punto de venta de la lista."));
  const lineas = filas(fd, 4);
  const realizada = fd.get("realizada") === "si" && lineas.length > 0;
  const c = await db.connect();
  let id: number;
  try {
    await c.query("BEGIN");
    const r = await c.query(
      `INSERT INTO venta (vendedor_id, punto_venta_id, realizada, motivo_no_venta)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      // el punto de venta llega como "123 · Tienda…": basta el número inicial
      [num(fd.get("vendedor")), pv.id, realizada, realizada ? null : txt(fd.get("motivo"))],
    );
    id = r.rows[0].id;
    for (const l of realizada ? lineas : []) {
      await c.query(
        `INSERT INTO venta_detalle (venta_id, lote_id, producto_id, cantidad, precio_unitario)
         SELECT $1, l.id, l.producto_id, $3, p.precio FROM lote l JOIN producto p ON p.id = l.producto_id WHERE l.id = $2`,
        [id, l.lote, l.cantidad],
      );
    }
    await c.query(
      `UPDATE venta SET total = coalesce((SELECT sum(cantidad * precio_unitario) FROM venta_detalle WHERE venta_id = $1), 0)
       WHERE id = $1`,
      [id],
    );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
  redirect(`/?ok=${id}`);
}

export async function registrarLote(fd: FormData) {
  const [l] = await q(
    `INSERT INTO lote (codigo, producto_id, camara_id, fecha_vencimiento, cantidad, costo_unitario)
     SELECT 'L' || p.codigo || '-' || to_char(now(), 'YYMMDD-HH24MISS'), p.id, $2, $3, $4, coalesce($5, p.costo)
     FROM producto p WHERE p.id = $1 RETURNING codigo`,
    [num(fd.get("producto")), num(fd.get("camara")) || null, txt(fd.get("vencimiento")), Math.trunc(num(fd.get("cantidad"))),
     num(fd.get("costo")) || null],
  );
  redirect(`/lotes?ok=${encodeURIComponent(l.codigo)}`);
}

export async function registrarInspeccion(fd: FormData) {
  const c = await db.connect();
  let id: number;
  try {
    await c.query("BEGIN");
    const r = await c.query(
      `INSERT INTO inspeccion (camara_id, inspector_id, temperatura, observacion) VALUES ($1, $2, $3, $4) RETURNING id`,
      [num(fd.get("camara")), num(fd.get("inspector")), num(fd.get("temperatura")), txt(fd.get("observacion"))],
    );
    id = r.rows[0].id;
    for (const m of filas(fd, 3)) {
      await c.query(`INSERT INTO merma (inspeccion_id, lote_id, cantidad, causa) VALUES ($1, $2, $3, $4)`,
        [id, m.lote, m.cantidad, m.causa ?? "Otro"]);
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
  redirect(`/inspeccion?ok=${id}`);
}
