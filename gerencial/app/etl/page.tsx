import { q } from "@/lib/db";
import { configurarEtl, ejecutarEtl } from "../acciones";

const n = (v: number) => v.toLocaleString("es-BO");

export default async function Etl() {
  const [[cfg], marcas, corridas] = await Promise.all([
    q(`SELECT intervalo_min, activo FROM ctl.etl_config`),
    // conciliación: lo que hay en el origen contra lo que ya está en el almacén
    q(`SELECT m.tabla, m.ultimo_id, to_char(m.actualizado AT TIME ZONE 'America/La_Paz', 'DD/MM HH24:MI:SS') actualizado, c.origen, c.destino, c.hecho
       FROM ctl.etl_marca m JOIN (
         SELECT 'venta' tabla, 'fact_visita' hecho, (SELECT count(*) FROM src.venta) origen, (SELECT count(*) FROM dw.fact_visita) destino
         UNION ALL SELECT 'venta_detalle', 'fact_venta', (SELECT count(*) FROM src.venta_detalle), (SELECT count(*) FROM dw.fact_venta)
         UNION ALL SELECT 'inspeccion', 'fact_inspeccion', (SELECT count(*) FROM src.inspeccion), (SELECT count(*) FROM dw.fact_inspeccion)
         UNION ALL SELECT 'merma', 'fact_merma', (SELECT count(*) FROM src.merma), (SELECT count(*) FROM dw.fact_merma)
       ) c USING (tabla) ORDER BY m.tabla`),
    q(`SELECT id, origen, estado, filas, error,
              to_char(inicio AT TIME ZONE 'America/La_Paz', 'DD/MM HH24:MI:SS') inicio,
              round(extract(epoch FROM fin - inicio)::numeric, 2) segundos
       FROM ctl.etl_corrida ORDER BY id DESC LIMIT 15`),
  ]);

  return (
    <>
      <h1>Carga de datos (ETL)</h1>
      <p className="bajada">
        El almacén se alimenta de la base transaccional leyendo solo lo nuevo: de cada tabla se guarda el último
        identificador cargado (la marca) y la corrida siguiente trae únicamente las filas posteriores.
      </p>

      <div className="rejilla dos" style={{ marginBottom: 16 }}>
        <section className="tarjeta">
          <h2>Programación</h2>
          <form action={configurarEtl}>
            <label>Ejecutar cada (minutos)<input name="intervalo" type="number" min="1" defaultValue={cfg.intervalo_min} /></label>
            <div className="opciones"><label><input type="checkbox" name="activo" defaultChecked={cfg.activo} />Carga automática activa</label></div>
            <div className="acciones"><button className="suave">Guardar programación</button></div>
          </form>
          <form action={ejecutarEtl} style={{ marginTop: 16 }}>
            <button>Ejecutar ahora</button>
          </form>
        </section>

        <section className="tarjeta">
          <h2>Marcas y conciliación</h2>
          <table>
            <thead><tr><th>Tabla de origen</th><th>Hecho</th><th className="num">Marca (último id)</th><th className="num">Filas origen</th>
              <th className="num">Filas almacén</th><th className="num">Pendientes</th><th>Actualizada</th></tr></thead>
            <tbody>
              {marcas.map((m) => (
                <tr key={m.tabla}>
                  <td>{m.tabla}</td><td>{m.hecho}</td><td className="num">{n(m.ultimo_id)}</td>
                  <td className="num">{n(m.origen)}</td><td className="num">{n(m.destino)}</td>
                  <td className="num">{m.origen === m.destino ? <span className="chip bien">0</span> : <span className="chip alerta">{n(m.origen - m.destino)}</span>}</td>
                  <td>{m.actualizado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="tarjeta">
        <h2>Últimas corridas</h2>
        <div className="desborde">
          <table>
            <thead><tr><th>Nº</th><th>Inicio</th><th>Origen</th><th>Estado</th><th className="num">Segundos</th><th>Filas cargadas</th></tr></thead>
            <tbody>
              {corridas.map((c) => (
                <tr key={c.id}>
                  <td>{c.id}</td><td>{c.inicio}</td><td>{c.origen}</td>
                  <td><span className={`chip ${c.estado === "ok" ? "bien" : c.estado === "error" ? "mal" : "alerta"}`}>{c.estado}</span></td>
                  <td className="num">{c.segundos ?? "—"}</td>
                  <td>{c.error ?? (Object.entries(c.filas as Record<string, number>).filter(([, v]) => v > 0)
                    .map(([t, v]) => `${t}: ${n(v)}`).join(" · ") || "sin novedades")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
