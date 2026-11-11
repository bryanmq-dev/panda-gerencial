"use client";

import { useEffect, useState, useTransition } from "react";
import { guardarKpi, previsualizar, type DatosKpi, type Vista } from "../acciones";
import Estrella from "./Estrella";
import Grafico from "./Grafico";

const TIPOS = ["monetaria", "operativa", "comercial", "calidad"];
const GRAFICOS = [["linea", "Línea"], ["barra", "Barras"], ["torta", "Torta"], ["tabla", "Tabla"]];

const VACIO: DatosKpi = {
  nombre: "", descripcion: "", unidad: "", tipo_medida: "operativa", sentido: "mayor", grafico: "linea", origen: "manual",
  sql: `SELECT f.periodo, sum(v.monto) AS ventas_bs
FROM dw.fact_venta v
JOIN dw.dim_fecha f ON f.fecha = v.fecha
GROUP BY f.periodo
ORDER BY f.periodo`,
};

/**
 * Editor de un KPI: el mismo formulario sirve para escribirlo a mano, para
 * versionar uno existente y para revisar lo que propone el asistente.
 * Nada se guarda sin pasar por la vista previa del propio almacén.
 */
export default function Editor({ inicial, vistaInicial }: { inicial?: Partial<DatosKpi>; vistaInicial?: Vista }) {
  const [d, setD] = useState<DatosKpi>({ ...VACIO, ...inicial });
  const [vista, setVista] = useState<Vista | undefined>(vistaInicial);
  const [error, setError] = useState("");
  const [ocupado, transicion] = useTransition();
  const campo = (k: keyof DatosKpi) => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value });

  const probar = () => transicion(async () => setVista(await previsualizar(d.sql)));
  const guardar = () => transicion(async () => {
    const r = await guardarKpi(d);       // si sale bien, redirige al KPI
    if (r?.error) setError(r.error);
  });
  // al abrir un KPI existente, la vista previa se carga sola
  useEffect(() => { if (!vistaInicial && inicial?.sql) probar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rejilla mitades">
      <div>
        <label>Nombre<input value={d.nombre} onChange={campo("nombre")} placeholder="Ventas netas por zona" /></label>
        <label>Qué mide<input value={d.descripcion} onChange={campo("descripcion")} /></label>
        <div className="rejilla cuatro" style={{ gap: 8 }}>
          <label>Unidad<input value={d.unidad} onChange={campo("unidad")} placeholder="Bs, %, L…" /></label>
          <label>Tipo de medida
            <select value={d.tipo_medida} onChange={campo("tipo_medida")}>{TIPOS.map((t) => <option key={t}>{t}</option>)}</select>
          </label>
          <label>Mejora cuando
            <select value={d.sentido} onChange={campo("sentido")}><option value="mayor">sube</option><option value="menor">baja</option></select>
          </label>
          <label>Gráfico
            <select value={d.grafico} onChange={campo("grafico")}>{GRAFICOS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
          </label>
        </div>
        <label>Consulta SQL sobre el esquema dw (primera columna: eje; siguientes: valores)
          <textarea className="sql" value={d.sql} onChange={campo("sql")} spellCheck={false} />
        </label>
        {d.id && <label>Nota de la versión<input value={d.nota ?? ""} onChange={campo("nota")} placeholder="Qué cambió" /></label>}
        <div className="acciones">
          <button type="button" className="suave" onClick={probar} disabled={ocupado}>Vista previa</button>
          <button type="button" onClick={guardar} disabled={ocupado || !vista?.ok}>
            {d.id ? "Guardar como versión nueva" : "Aprobar y guardar"}
          </button>
          {ocupado && <span className="tenue">Consultando el almacén…</span>}
        </div>
        {!vista?.ok && !ocupado && <p className="tenue">Para guardar, primero ejecute la vista previa sin errores.</p>}
        {error && <p className="aviso mal" style={{ marginTop: 12 }}>{error}</p>}
      </div>

      <div>
        {!vista && <p className="tenue">La vista previa ejecuta la consulta con un usuario de solo lectura y muestra qué tablas enlaza.</p>}
        {vista && !vista.ok && <p className="aviso mal">{vista.error}</p>}
        {vista?.ok && (
          <>
            <Grafico cols={vista.r.cols} filas={vista.r.filas} tipo={d.grafico} />
            <p className="tenue" style={{ margin: "12px 0 4px" }}>
              Tablas que usa la consulta ({vista.r.filas.length} filas en la vista previa)
            </p>
            <Estrella tablas={vista.r.tablas} enlaces={vista.enlaces} />
          </>
        )}
      </div>
    </div>
  );
}
