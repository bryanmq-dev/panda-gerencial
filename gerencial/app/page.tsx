import Link from "next/link";
import { q } from "@/lib/db";
import { esSerie, evaluar } from "@/lib/kgi";
import { fmt, hoy, kgis, kpis, mesCorto, serie } from "@/lib/kpi";
import Grafico from "./_c/Grafico";

export default async function Control() {
  const [ks, gs, [etl]] = await Promise.all([
    kpis(),
    kgis(),
    q(`SELECT to_char(fin AT TIME ZONE 'America/La_Paz', 'DD/MM HH24:MI') fin, estado FROM ctl.etl_corrida ORDER BY id DESC LIMIT 1`),
  ]);
  const series = await Promise.all(ks.map(serie));
  const dia = hoy();
  const mesActual = dia.slice(0, 7) + "-01";
  const porId = new Map(ks.map((k, i) => [k.id, { k, s: series[i] }]));

  const objetivos = gs.filter((g) => !g.cerrado && porId.has(g.kpi_id)).map((g) => {
    const { k, s } = porId.get(g.kpi_id)!;
    return { g, k, e: evaluar(g, k.sentido, s.filas, dia) };
  });

  return (
    <>
      <h1>Control de operaciones</h1>
      <p className="bajada">
        Cada indicador (KPI) sale de una consulta sobre el almacén de datos. Sobre un indicador se abre una operación con
        un objetivo (KGI): desde ese momento se mide cuánto del camino hacia la meta se ha recorrido.
        {etl && <> Última carga de datos: {etl.fin ?? "en curso"} <span className={`chip ${etl.estado === "ok" ? "bien" : "mal"}`}>{etl.estado}</span></>}
      </p>

      <section className="tarjeta" style={{ marginBottom: 16 }}>
        <h2>Objetivos en curso</h2>
        {!objetivos.length && <p className="tenue">No hay objetivos abiertos. Abra uno desde el detalle de un indicador.</p>}
        {objetivos.length > 0 && (
          <div className="desborde">
            <table>
              <thead>
                <tr><th>Objetivo</th><th>Indicador</th><th>Tipo</th><th>Ventana</th><th className="num">Inicio</th>
                  <th className="num">Actual</th><th className="num">Meta</th><th style={{ width: 160 }}>Avance</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {objetivos.map(({ g, k, e }) => (
                  <tr key={g.id}>
                    <td><Link href={`/kpi/${k.id}#objetivos`}>{g.nombre}</Link></td>
                    <td>{k.nombre}</td>
                    <td><span className="chip gris">{g.tipo_medida}</span></td>
                    <td>{mesCorto(g.desde)} → {mesCorto(g.hasta)}</td>
                    <td className="num">{fmt(e.base, k.unidad)}</td>
                    <td className="num">{fmt(e.actual, k.unidad)}{e.periodo && <span className="tenue"> · {mesCorto(e.periodo)}</span>}</td>
                    <td className="num">{fmt(g.meta, k.unidad)}</td>
                    <td>
                      <div className={`progreso ${e.cumple ? "bien" : e.vencido ? "mal" : ""}`}><i style={{ width: `${Math.round(e.avance * 100)}%` }} /></div>
                      <span className="tenue">{Math.round(e.avance * 100)} % del camino</span>
                    </td>
                    <td>{e.actual == null ? <span className="chip gris">Sin datos aún</span>
                      : e.cumple ? <span className="chip bien">Meta alcanzada</span>
                      : e.vencido ? <span className="chip mal">Vencido sin cumplir</span>
                      : <span className="chip alerta">En curso</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="rejilla tres">
        {ks.map((k, i) => {
          const s = series[i];
          // titular (solo con una serie): último mes cerrado (el mes en curso tiene datos parciales)
          const cerrados = esSerie(s.filas) && s.cols.length === 2 ? s.filas.filter((f) => (f[0] as string) < mesActual && typeof f[1] === "number") : [];
          const ult = cerrados.at(-1), ant = cerrados.at(-2);
          const delta = ult && ant && ant[1] ? ((ult[1] as number) - (ant[1] as number)) / Math.abs(ant[1] as number) : null;
          const mejora = delta != null && (k.sentido === "mayor" ? delta >= 0 : delta <= 0);
          return (
            <section className="tarjeta" key={k.id}>
              <div className="acciones" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                <h2 style={{ margin: 0 }}><Link href={`/kpi/${k.id}`}>{k.nombre}</Link></h2>
                <span className="chip gris">{k.tipo_medida}</span>
              </div>
              {s.error ? <p className="aviso mal">{s.error}</p> : (
                <>
                  {ult && (
                    <p style={{ margin: "0 0 8px" }}>
                      <span className="cifra">{fmt(ult[1] as number, k.unidad)}</span>{" "}
                      <span className="tenue">{mesCorto(ult[0] as string)}</span>{" "}
                      {delta != null && (
                        <span className={`chip ${mejora ? "bien" : "mal"}`}>
                          {delta >= 0 ? "+" : "−"}{Math.abs(delta * 100).toFixed(1)} % vs. mes anterior
                        </span>
                      )}
                    </p>
                  )}
                  <Grafico cols={s.cols} filas={s.filas} tipo={k.grafico} alto={ult ? 110 : 170} mini={k.grafico !== "torta"} />
                </>
              )}
              <div className="acciones" style={{ marginTop: 12 }}>
                <Link className="boton suave" href={`/kpi/${k.id}`}>Ver cálculo</Link>
                {ult && <Link className="boton suave" href={`/kpi/${k.id}#objetivos`}>Agregar objetivo</Link>}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
