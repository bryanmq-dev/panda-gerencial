"use client";

import { useState } from "react";
import { crearKgi } from "../acciones";
import { valorEnFecha } from "@/lib/kgi";

type Celda = string | number | null;

/**
 * Formulario de un objetivo. El valor de inicio se propone según la fecha
 * "desde": lo que valía el indicador en ese periodo, y queda vacío si no hay
 * dato. Se puede corregir a mano; al cambiar la fecha se vuelve a proponer.
 */
export default function FormKgi({ kpiId, unidad, tipoInicial, tipos, serie, hoy }: {
  kpiId: number; unidad: string; tipoInicial: string; tipos: string[]; serie: Celda[][]; hoy: string;
}) {
  const [desde, setDesde] = useState(hoy);
  const [base, setBase] = useState(valorEnFecha(serie, hoy)?.toString() ?? "");
  const hay = valorEnFecha(serie, desde) !== undefined;

  return (
    <form action={crearKgi}>
      <input type="hidden" name="kpi_id" value={kpiId} />
      <div className="rejilla cinco" style={{ gap: 8 }}>
        <label>Objetivo<input name="nombre" required placeholder="Llevar la conversión a 75 %" /></label>
        <label>Valor de inicio ({unidad || "valor"})
          <input name="base" type="number" step="any" value={base} onChange={(e) => setBase(e.target.value)}
            placeholder={hay ? "" : "sin dato en esa fecha"} />
        </label>
        <label>Meta ({unidad || "valor"})<input name="meta" type="number" step="any" required /></label>
        <label>Desde
          <input name="desde" type="date" required value={desde}
            onChange={(e) => { setDesde(e.target.value); setBase(valorEnFecha(serie, e.target.value)?.toString() ?? ""); }} />
        </label>
        <label>Hasta<input name="hasta" type="date" required /></label>
      </div>
      <div className="rejilla dos" style={{ gap: 8 }}>
        <label>Tipo de medida
          <select name="tipo_medida" defaultValue={tipoInicial}>{tipos.map((t) => <option key={t}>{t}</option>)}</select>
        </label>
        <label>Qué se va a hacer para lograrlo<input name="descripcion" /></label>
      </div>
      <div className="acciones">
        <button>Agregar objetivo e iniciar operación</button>
        <span className="tenue">
          El avance se mide desde el valor de inicio, que sigue a la fecha «Desde»: el del mes de esa fecha, y el de hoy si es este mes.
          {!hay && " Para esa fecha no hay dato: déjelo vacío o escríbalo."}
        </span>
      </div>
    </form>
  );
}
