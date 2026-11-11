"use client";

import { useState, useTransition } from "react";
import { preguntar } from "../acciones";
import Editor from "./Editor";

type Respuesta = Awaited<ReturnType<typeof preguntar>>;
type Mensaje = { rol: "gerente"; texto: string } | { rol: "asistente"; texto: string; r: Respuesta };

const EJEMPLOS = [
  "Ventas mensuales de yogurt en El Alto Norte",
  "¿Qué vendedores tienen la mejor conversión de visita en venta?",
  "Merma en bolivianos por producto, de mayor a menor",
];

export default function Chat() {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [ocupado, transicion] = useTransition();

  const enviar = (pedido: string) => {
    if (!pedido.trim() || ocupado) return;
    const nuevos: Mensaje[] = [...mensajes, { rol: "gerente", texto: pedido.trim() }];
    setMensajes(nuevos);
    setTexto("");
    transicion(async () => {
      // al modelo vuelve su propia salida completa (con el SQL), no solo la frase visible
      const r = await preguntar(nuevos.map((m) => ({ rol: m.rol, texto: m.rol === "asistente" ? m.r.crudo || m.texto : m.texto })));
      setMensajes([...nuevos, { rol: "asistente", texto: r.texto, r }]);
    });
  };

  return (
    <div className="chat">
      {!mensajes.length && (
        <div className="acciones">
          {EJEMPLOS.map((e) => <button key={e} type="button" className="suave" onClick={() => enviar(e)}>{e}</button>)}
        </div>
      )}
      {mensajes.map((m, i) => m.rol === "gerente" ? (
        <div key={i} className="burbuja yo">{m.texto}</div>
      ) : (
        <div key={i} style={{ display: "grid", gap: 12 }}>
          <div className="burbuja ia">{m.texto}</div>
          {m.r.propuesta && (
            <section className="tarjeta">
              <h2>Propuesta del asistente: revísela antes de guardar</h2>
              {m.r.error && <p className="aviso mal">El almacén rechazó la consulta: {m.r.error}</p>}
              <Editor
                inicial={{ ...m.r.propuesta, origen: "ia" }}
                vistaInicial={m.r.vista ? { ok: true, r: m.r.vista, enlaces: m.r.enlaces ?? [] } : undefined}
              />
            </section>
          )}
        </div>
      ))}
      {ocupado && <div className="burbuja ia tenue">Armando la consulta y probándola en el almacén…</div>}
      <form className="fila" onSubmit={(e) => { e.preventDefault(); enviar(texto); }}>
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Describa qué quiere ver…" aria-label="Pedido al asistente" />
        <button disabled={ocupado || !texto.trim()}>Enviar</button>
      </form>
    </div>
  );
}
