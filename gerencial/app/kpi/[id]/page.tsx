import { notFound } from "next/navigation";
import { enlaces, q } from "@/lib/db";
import { esSerie, evaluar } from "@/lib/kgi";
import { fmt, hoy, kgis, kpi, mesCorto, serie, TIPOS } from "@/lib/kpi";
import { foto, ultimoSnapshot } from "@/lib/snapshot";
import { combinar } from "@/lib/snapshot-reglas";
import { archivarKpi, cerrarKgi, restaurarKpi } from "../../acciones";
import Avance from "../../_c/Avance";
import Editor from "../../_c/Editor";
import Estrella from "../../_c/Estrella";
import FormKgi from "../../_c/FormKgi";
import Grafico from "../../_c/Grafico";

export default async function Detalle({ params }: { params: Promise<{ id: string }> }) {
  const k = await kpi(Number((await params).id));
  if (!k) notFound();
  const [s, gs, fks, versiones] = await Promise.all([
    serie(k),
    kgis(k.id),
    enlaces(),
    q(`SELECT version, origen, nota, sql, to_char(creado_en AT TIME ZONE 'America/La_Paz', 'DD/MM/YYYY HH24:MI') cuando
       FROM ctl.kpi_version WHERE kpi_id = $1 ORDER BY version DESC`, [k.id]),
  ]);
  const dia = hoy();
  const snap = await ultimoSnapshot();
  const f = snap ? (await foto(snap.id)).get(k.id) : undefined;
  // la foto vale mientras no se haya cambiado la consulta del indicador
  const par = combinar(f && f.version === k.version ? f.filas : s.filas, s.filas);
  const admiteObjetivo = esSerie(s.filas);
  const abiertos = gs.filter((g) => !g.cerrado);

  return (
    <>
      <h1>{k.nombre}</h1>
      <p className="bajada">
        {k.descripcion}{" "}
        <span className="chip gris">{k.tipo_medida}</span>{" "}
        <span className="chip gris">mejora cuando {k.sentido === "mayor" ? "sube" : "baja"}</span>{" "}
        <span className="chip">versión {k.version} · {k.origen}</span>{k.archivado && <> <span className="chip mal">archivado</span></>}
      </p>

      <section className="tarjeta" style={{ marginBottom: 16 }}>
        {s.error ? <p className="aviso mal">{s.error}</p>
          : <Grafico cols={s.cols} filas={par.snapshot} movimientos={par.movimientos} tipo={k.grafico} alto={300}
              metas={admiteObjetivo ? abiertos.map((g) => ({ nombre: g.nombre, valor: g.meta })) : []} />}
      </section>

      <div className="rejilla mitades" style={{ marginBottom: 16 }}>
        <section className="tarjeta">
          <h2>De dónde sale: tablas enlazadas</h2>
          <Estrella tablas={s.tablas} enlaces={fks} />
          <p className="tenue" style={{ marginTop: 8 }}>
            En color, las tablas de hechos; en blanco, las dimensiones. Cada línea es la columna que las une.
          </p>
        </section>
        <section className="tarjeta">
          <h2>La consulta</h2>
          <pre className="sql">{k.sql}</pre>
        </section>
      </div>

      <section className="tarjeta" id="objetivos" style={{ marginBottom: 16 }}>
        <h2>Objetivos (KGI) sobre este indicador</h2>
        {!admiteObjetivo && (
          <p className="tenue">Este indicador compara categorías, no una evolución en el tiempo: no admite objetivos. Los objetivos se abren sobre indicadores cuyo eje es el periodo.</p>
        )}
        {gs.length > 0 && (
          <div className="desborde" style={{ marginBottom: 16 }}>
            <table>
              <thead><tr><th>Objetivo</th><th>Tipo</th><th>Ventana</th><th className="num">Inicio</th><th className="num">Actual</th>
                <th className="num">Meta</th><th style={{ width: 150 }}>Avance</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {gs.map((g) => {
                  const e = evaluar(g, k.sentido, par.snapshot, snap?.corte ?? dia, true);   // la foto cuenta el mes en curso a su corte
                  const vivo = evaluar(g, k.sentido, s.filas, dia, true);
                  return (
                    <tr key={g.id}>
                      <td>{g.nombre}<br /><span className="tenue">{g.descripcion}</span></td>
                      <td><span className="chip gris">{g.tipo_medida}</span></td>
                      <td>{mesCorto(g.desde)} → {mesCorto(g.hasta)}</td>
                      <td className="num">{fmt(e.base, k.unidad)}</td>
                      <td className="num">{fmt(e.actual, k.unidad)}</td>
                      <td className="num">{fmt(g.meta, k.unidad)}</td>
                      <td>
                        <Avance snap={e.avance} hoy={vivo.avance} cumple={e.cumple} />
                      </td>
                      <td>{g.cerrado ? <span className="chip gris">Cerrado</span>
                        : e.actual == null ? <span className="chip gris">Sin datos aún</span>
                        : e.cumple ? <span className="chip bien">Meta alcanzada</span>
                        : e.vencido ? <span className="chip mal">Vencido</span>
                        : <span className="chip alerta">En curso</span>}</td>
                      <td>
                        <form action={cerrarKgi}>
                          <input type="hidden" name="id" value={g.id} />
                          <button className="suave">{g.cerrado ? "Reabrir" : "Cerrar"}</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {admiteObjetivo && <FormKgi kpiId={k.id} unidad={k.unidad} tipoInicial={k.tipo_medida} tipos={TIPOS} serie={s.filas} hoy={dia} />}
      </section>

      <section className="tarjeta" style={{ marginBottom: 16 }}>
        <details>
          <summary><strong>Modificar el indicador</strong> <span className="tenue">(se guarda como versión nueva)</span></summary>
          <div style={{ marginTop: 16 }}>
            <Editor inicial={{ id: k.id, nombre: k.nombre, descripcion: k.descripcion, unidad: k.unidad, tipo_medida: k.tipo_medida,
              sentido: k.sentido, grafico: k.grafico, sql: k.sql, origen: "manual" }} />
          </div>
        </details>
      </section>

      <section className="tarjeta" style={{ marginBottom: 16 }}>
        <h2>Historial de versiones</h2>
        <table>
          <thead><tr><th>Versión</th><th>Origen</th><th>Fecha</th><th>Nota</th><th>Consulta</th></tr></thead>
          <tbody>
            {versiones.map((v) => (
              <tr key={v.version}>
                <td>{v.version}{v.version === k.version && <> <span className="chip bien">vigente</span></>}</td>
                <td><span className={`chip ${v.origen === "ia" ? "alerta" : "gris"}`}>{v.origen}</span></td>
                <td>{v.cuando}</td>
                <td>{v.nota}</td>
                <td><details><summary>ver SQL</summary><pre className="sql" style={{ marginTop: 8 }}>{v.sql}</pre></details></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <form action={k.archivado ? restaurarKpi : archivarKpi}>
        <input type="hidden" name="id" value={k.id} />
        <button className="suave">{k.archivado ? "Restaurar indicador" : "Archivar indicador"}</button>
      </form>
    </>
  );
}
