import { q } from "@/lib/db";
import { registrarVenta } from "./acciones";

const MOTIVOS = ["Aún tiene stock", "Falta de caja del tendero", "Congelador averiado",
  "Producto de competidor en consignación", "Punto de venta cerrado"];

export default async function Ventas({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const [vendedores, puntos, lotes, ultimas] = await Promise.all([
    q(`SELECT u.id, u.nombre, z.nombre zona FROM usuario u LEFT JOIN zona z ON z.id = u.zona_id
       WHERE u.rol = 'vendedor' AND u.activo ORDER BY u.nombre`),
    q(`SELECT p.id, p.nombre, z.nombre zona FROM punto_venta p JOIN zona z ON z.id = p.zona_id ORDER BY p.id`),
    // lotes recientes: lo que hoy está en el camión
    q(`SELECT l.id, l.codigo, p.nombre, p.precio FROM lote l JOIN producto p ON p.id = l.producto_id
       WHERE l.fecha_ingreso >= current_date - 14 ORDER BY p.codigo, l.fecha_ingreso DESC`),
    q(`SELECT v.id, to_char(v.fecha, 'DD/MM HH24:MI') cuando, u.nombre vendedor, p.nombre punto, v.realizada,
              v.motivo_no_venta, v.total, (SELECT count(*) FROM venta_detalle d WHERE d.venta_id = v.id) lineas
       FROM venta v JOIN usuario u ON u.id = v.vendedor_id JOIN punto_venta p ON p.id = v.punto_venta_id
       ORDER BY v.id DESC LIMIT 12`),
  ]);

  return (
    <>
      <h1>Registro de visita y venta</h1>
      <p className="bajada">El repartidor registra cada visita a un punto de venta: si hubo venta, los lotes entregados; si no, el motivo.</p>
      {ok && <p className="aviso">Visita Nº {ok} registrada.</p>}
      {error && <p className="aviso mal">{error}</p>}

      <div className="rejilla dos">
        <form action={registrarVenta} className="tarjeta">
          <h2>Nueva visita</h2>
          <label>Repartidor
            <select name="vendedor" required>
              {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre} — {v.zona}</option>)}
            </select>
          </label>
          <label>Punto de venta (escriba para buscar)
            <input name="punto_venta" list="puntos" required placeholder="Nº o nombre" autoComplete="off" />
            <datalist id="puntos">
              {puntos.map((p) => <option key={p.id} value={`${p.id} · ${p.nombre} (${p.zona})`} />)}
            </datalist>
          </label>
          <div className="opciones">
            <label><input type="radio" name="realizada" value="si" defaultChecked />Hubo venta</label>
            <label><input type="radio" name="realizada" value="no" />No hubo venta</label>
          </div>
          <label>Motivo, si no hubo venta
            <select name="motivo">{MOTIVOS.map((m) => <option key={m}>{m}</option>)}</select>
          </label>
          <label>Productos entregados (lote y unidades)</label>
          {[1, 2, 3, 4].map((i) => (
            <div className="fila" key={i}>
              <select name={`lote${i}`} aria-label={`Lote ${i}`}>
                <option value="">—</option>
                {lotes.map((l) => <option key={l.id} value={l.id}>{l.nombre} · {l.codigo} · Bs {l.precio.toFixed(2)}</option>)}
              </select>
              <input name={`cant${i}`} type="number" min="0" placeholder="Unid." aria-label={`Unidades ${i}`} />
            </div>
          ))}
          <div className="acciones" style={{ marginTop: 12 }}><button>Registrar visita</button></div>
        </form>

        <section className="tarjeta">
          <h2>Últimas visitas</h2>
          <div className="desborde">
            <table>
              <thead><tr><th>Nº</th><th>Fecha</th><th>Repartidor</th><th>Punto de venta</th><th>Resultado</th><th className="num">Total Bs</th></tr></thead>
              <tbody>
                {ultimas.map((v) => (
                  <tr key={v.id}>
                    <td>{v.id}</td><td>{v.cuando}</td><td>{v.vendedor}</td><td>{v.punto}</td>
                    <td>{v.realizada
                      ? <span className="chip bien">Venta · {v.lineas} líneas</span>
                      : <span className="chip gris">{v.motivo_no_venta ?? "Sin venta"}</span>}</td>
                    <td className="num">{v.total.toFixed(2)}</td>
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
