import { q } from "@/lib/db";
import { registrarInspeccion } from "../acciones";

const CAUSAS = ["Falla de equipo", "Corte de energía", "Vencimiento", "Manipulación", "Rotura de cadena en tránsito"];

export default async function Inspeccion({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { ok } = await searchParams;
  const [camaras, inspectores, lotes, ultimas] = await Promise.all([
    q(`SELECT id, nombre, temp_min, temp_max FROM camara ORDER BY id`),
    q(`SELECT id, nombre FROM usuario WHERE rol = 'inspector' AND activo ORDER BY nombre`),
    q(`SELECT l.id, l.codigo, p.nombre, c.nombre camara FROM lote l JOIN producto p ON p.id = l.producto_id
       JOIN camara c ON c.id = l.camara_id WHERE l.fecha_ingreso >= current_date - 30 ORDER BY c.id, l.fecha_ingreso DESC`),
    q(`SELECT i.id, to_char(i.fecha, 'DD/MM HH24:MI') cuando, c.nombre camara, u.nombre inspector, i.temperatura,
              i.temperatura NOT BETWEEN c.temp_min AND c.temp_max fuera,
              (SELECT coalesce(sum(m.cantidad), 0) FROM merma m WHERE m.inspeccion_id = i.id) merma
       FROM inspeccion i JOIN camara c ON c.id = i.camara_id JOIN usuario u ON u.id = i.inspector_id
       ORDER BY i.id DESC LIMIT 12`),
  ]);

  return (
    <>
      <h1>Inspección de cámaras</h1>
      <p className="bajada">Ronda periódica: el inspector anota la temperatura de la cámara y da de baja los lotes que se echaron a perder.</p>
      {ok && <p className="aviso">Inspección Nº {ok} registrada.</p>}

      <div className="rejilla dos">
        <form action={registrarInspeccion} className="tarjeta">
          <h2>Nueva inspección</h2>
          <label>Cámara
            <select name="camara" required>
              {camaras.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.temp_min} a {c.temp_max} °C)</option>)}
            </select>
          </label>
          <label>Inspector
            <select name="inspector" required>
              {inspectores.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </label>
          <label>Temperatura leída (°C)<input name="temperatura" type="number" step="0.1" required /></label>
          <label>Observación<textarea name="observacion" /></label>
          <label>Merma detectada (lote, unidades y causa)</label>
          {[1, 2, 3].map((i) => (
            <div className="fila3" key={i}>
              <select name={`lote${i}`} aria-label={`Lote ${i}`}>
                <option value="">—</option>
                {lotes.map((l) => <option key={l.id} value={l.id}>{l.camara} · {l.nombre} · {l.codigo}</option>)}
              </select>
              <input name={`cant${i}`} type="number" min="0" placeholder="Unid." aria-label={`Unidades ${i}`} />
              <select name={`causa${i}`} aria-label={`Causa ${i}`}>{CAUSAS.map((c) => <option key={c}>{c}</option>)}</select>
            </div>
          ))}
          <div className="acciones" style={{ marginTop: 12 }}><button>Registrar inspección</button></div>
        </form>

        <section className="tarjeta">
          <h2>Últimas inspecciones</h2>
          <div className="desborde">
            <table>
              <thead><tr><th>Nº</th><th>Fecha</th><th>Cámara</th><th>Inspector</th><th className="num">°C</th><th>Estado</th><th className="num">Merma (u)</th></tr></thead>
              <tbody>
                {ultimas.map((i) => (
                  <tr key={i.id}>
                    <td>{i.id}</td><td>{i.cuando}</td><td>{i.camara}</td><td>{i.inspector}</td>
                    <td className="num">{i.temperatura.toFixed(1)}</td>
                    <td>{i.fuera ? <span className="chip mal">Fuera de rango</span> : <span className="chip bien">En rango</span>}</td>
                    <td className="num">{i.merma}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
