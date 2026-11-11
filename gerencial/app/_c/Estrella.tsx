type Enlace = { origen: string; destino: string; columna: string };

const ANCHO = 720, CAJA_W = 150, CAJA_H = 34;

/**
 * Las tablas que usa una consulta y cómo se enlazan: hechos al centro,
 * dimensiones arriba y abajo, una línea por cada llave foránea.
 */
export default function Estrella({ tablas, enlaces }: { tablas: string[]; enlaces: Enlace[] }) {
  if (!tablas.length) return null;
  const corto = (t: string) => t.replace(/^dw\./, "");
  const hechos = tablas.filter((t) => corto(t).startsWith("fact_"));
  const dims = tablas.filter((t) => !hechos.includes(t));
  // sin hechos, las dimensiones ocupan la fila central
  const filas = hechos.length ? [dims.filter((_, i) => i % 2 === 0), hechos, dims.filter((_, i) => i % 2 === 1)] : [[], dims, []];

  const pos = new Map<string, { x: number; y: number }>();
  const ys = [22, 110, 198];
  filas.forEach((fila, f) => fila.forEach((t, i) => pos.set(t, { x: (ANCHO * (i + 1)) / (fila.length + 1), y: ys[f] })));
  const alto = filas[2].length ? 236 : filas[0].length ? 148 : 60;
  const desplazar = filas[0].length ? 0 : -88;   // sin fila superior, todo sube
  const lineas = enlaces.filter((e) => pos.has(e.origen) && pos.has(e.destino));

  return (
    <svg viewBox={`0 0 ${ANCHO} ${alto}`} role="img" aria-label={`Tablas usadas: ${tablas.map(corto).join(", ")}`}
      style={{ width: "100%", maxWidth: ANCHO, height: "auto", display: "block" }}>
      <g transform={`translate(0 ${desplazar})`}>
        {lineas.map((e, i) => {
          const a = pos.get(e.origen)!, b = pos.get(e.destino)!;
          return (
            <g key={i}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#9fb3bf" strokeWidth={1.5} />
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} textAnchor="middle" fontSize={12} fill="#4a5a66"
                stroke="#fff" strokeWidth={3} paintOrder="stroke">{e.columna}</text>
            </g>
          );
        })}
        {[...pos].map(([t, p]) => {
          const hecho = hechos.includes(t);
          return (
            <g key={t}>
              <rect x={p.x - CAJA_W / 2} y={p.y - CAJA_H / 2} width={CAJA_W} height={CAJA_H} rx={6}
                fill={hecho ? "#0f6c7a" : "#fff"} stroke={hecho ? "#0f6c7a" : "#9fb3bf"} strokeWidth={1.5} />
              <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={12} fontWeight={600} fill={hecho ? "#fff" : "#11202a"}>{corto(t)}</text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
