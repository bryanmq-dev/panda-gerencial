import { q } from "@/lib/db";
import { registrarLote } from "../acciones";

export default async function Lotes({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { ok } = await searchParams;
  const [productos, camaras, lotes] = await Promise.all([
    q(`SELECT id, codigo, nombre, costo FROM producto ORDER BY codigo`),
    q(`SELECT id, nombre, temp_min, temp_max FROM camara ORDER BY id`),
    q(`SELECT l.codigo, p.nombre producto, c.nombre camara, to_char(l.fecha_ingreso, 'DD/MM/YYYY') ingreso,
              to_char(l.fecha_vencimiento, 'DD/MM/YYYY') vence, l.cantidad, l.costo_unitario
       FROM lote l JOIN producto p ON p.id = l.producto_id LEFT JOIN camara c ON c.id = l.camara_id
       ORDER BY l.id DESC LIMIT 15`),
  ]);

  return (
    <>
      <h1>Lotes de producto</h1>
      <p className="bajada">Cada lote que entra a la planta queda asociado a un producto y a la cámara donde se guarda.</p>
      {ok && <p className="aviso">Lote {ok} registrado.</p>}

      <div className="rejilla dos">
        <form action={registrarLote} className="tarjeta">
          <h2>Nuevo lote</h2>
          <label>Producto
            <select name="producto" required>
              {productos.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}</option>)}
            </select>
          </label>
          <label>Cámara
            <select name="camara">
              <option value="">Sin frío (agua)</option>
              {camaras.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.temp_min} a {c.temp_max} °C)</option>)}
            </select>
          </label>
          <div className="fila">
            <label>Unidades<input name="cantidad" type="number" min="1" required /></label>
            <label>Costo unit. Bs<input name="costo" type="number" step="0.0001" min="0" placeholder="estándar" /></label>
          </div>
          <label>Vence el<input name="vencimiento" type="date" /></label>
          <div className="acciones"><button>Registrar lote</button></div>
        </form>

        <section className="tarjeta">
          <h2>Últimos lotes</h2>
          <div className="desborde">
            <table>
              <thead><tr><th>Código</th><th>Producto</th><th>Cámara</th><th>Ingreso</th><th>Vence</th><th className="num">Unidades</th><th className="num">Costo Bs</th></tr></thead>
              <tbody>
                {lotes.map((l) => (
                  <tr key={l.codigo}>
                    <td>{l.codigo}</td><td>{l.producto}</td><td>{l.camara ?? "—"}</td><td>{l.ingreso}</td><td>{l.vence ?? "—"}</td>
                    <td className="num">{l.cantidad.toLocaleString("es-BO")}</td><td className="num">{l.costo_unitario.toFixed(2)}</td>
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
