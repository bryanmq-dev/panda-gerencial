"use client";

import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

type Celda = string | number | null;
export type Meta = { nombre: string; valor: number };

const COLORES = ["#0f6c7a", "#b0801f", "#a33520", "#4a5a66", "#2f7d4f", "#7a4ea3"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const eje = (v: Celda) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? `${MESES[Number(v.slice(5, 7)) - 1]} ${v.slice(2, 4)}` : String(v ?? "—");
const num = (v: unknown) => (typeof v === "number" ? v.toLocaleString("es-BO", { maximumFractionDigits: 2 }) : String(v ?? ""));
const compacto = (v: number) => Intl.NumberFormat("es-BO", { notation: "compact", maximumFractionDigits: 1 }).format(v);

const NARANJA = "#e07b00";
const esFecha = (v: Celda) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);

/**
 * Dibuja el resultado de un KPI. Convención: la primera columna es el eje y
 * las demás son series numéricas.
 *
 * `filas` es lo que decía el último snapshot (en azul). `movimientos`, si
 * existe, es la lectura en vivo desde entonces (en naranja): en una serie
 * continúa la misma línea; en barras por categoría va al lado de cada barra.
 */
export default function Grafico({ cols, filas, movimientos = null, tipo, alto = 260, metas = [], mini = false }: {
  cols: string[]; filas: Celda[][]; movimientos?: Celda[][] | null; tipo: string; alto?: number; metas?: Meta[]; mini?: boolean;
}) {
  if (!filas.length && !movimientos?.length) return <p className="tenue">La consulta no devolvió filas.</p>;
  const series = cols.slice(1);
  const conMov = !!movimientos?.length && (tipo === "linea" || tipo === "barra");

  // tabla y torta no distinguen: muestran lo más reciente
  if (tipo === "tabla" || tipo === "torta") filas = movimientos?.length ? movimientos : filas;

  if (tipo === "tabla") {
    return (
      <div className="desborde" style={{ maxHeight: alto, overflowY: "auto" }}>
        <table>
          <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i}>{f.map((v, j) => <td key={j} className={typeof v === "number" ? "num" : ""}>{j ? num(v) : eje(v)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // una fila por posición del eje, con el valor de la foto y, aparte, el de hoy
  const xs = [...new Set([...(tipo === "barra" && conMov ? movimientos! : []), ...filas, ...(movimientos ?? [])].map((f) => String(f[0])))];
  if (esFecha(filas[0]?.[0] ?? null)) xs.sort();
  const por = (rs: Celda[][] | null) => new Map((rs ?? []).map((f) => [String(f[0]), f]));
  const foto = por(filas), vivo = por(conMov ? movimientos : null);
  const datos = xs.map((x) => Object.fromEntries([
    ["_x", eje(x)],
    ...series.flatMap((sr, i) => [[sr, foto.get(x)?.[i + 1] ?? null], [sr + "__mov", vivo.get(x)?.[i + 1] ?? null]]),
  ]));
  const nombre = (sr: string, mov: boolean) =>
    mov ? (series.length > 1 ? `${sr} · movimientos` : "Últimos movimientos") : conMov && series.length === 1 ? "Última snapshot" : sr;
  const margen = mini ? { top: 4, right: 4, bottom: 0, left: 0 } : { top: 8, right: 16, bottom: 0, left: 0 };
  const comun = (
    <>
      {!mini && <CartesianGrid stroke="#e3eaee" vertical={false} />}
      <XAxis dataKey="_x" tick={{ fontSize: 12, fill: "#4a5a66" }} tickLine={false} axisLine={{ stroke: "#d5dee4" }} hide={mini}
        interval={tipo === "barra" ? 0 : "preserveStartEnd"}
        {...(tipo === "barra" && !mini && xs.length > 4 ? { angle: -30, textAnchor: "end" as const, height: 78 } : {})} />
      <YAxis tick={{ fontSize: 12, fill: "#4a5a66" }} tickLine={false} axisLine={false} width={48} tickFormatter={compacto} hide={mini}
        domain={tipo === "linea" ? ["auto", "auto"] : [0, "auto"]} />
      <Tooltip formatter={(v) => num(v)} contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: "#d5dee4" }} />
      {!mini && series.length > 1 && !conMov && <Legend wrapperStyle={{ fontSize: 12 }} />}
      {metas.map((m) => (
        <ReferenceLine key={m.nombre} y={m.valor} stroke="#a33520" strokeDasharray="5 4"
          label={{ value: `Meta ${num(m.valor)}`, position: "insideTopRight", fontSize: 12, fill: "#a33520" }} />
      ))}
    </>
  );

  return (
    <>
      <ResponsiveContainer width="100%" height={alto}>
        {tipo === "torta" ? (
          <PieChart>
            <Pie data={datos} dataKey={series[0]} nameKey="_x" innerRadius="45%" outerRadius="80%" paddingAngle={1} isAnimationActive={false}>
              {datos.map((_, i) => <Cell key={i} fill={COLORES[i % COLORES.length]} />)}
            </Pie>
            <Tooltip formatter={(v) => num(v)} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
            {!mini && <Legend wrapperStyle={{ fontSize: 12 }} />}
          </PieChart>
        ) : tipo === "barra" ? (
          <BarChart data={datos} margin={margen}>
            {comun}
            {series.map((sr, i) => <Bar key={sr} name={nombre(sr, false)} dataKey={sr} fill={COLORES[i % COLORES.length]} radius={[3, 3, 0, 0]} isAnimationActive={false} />)}
            {conMov && series.map((sr) => <Bar key={sr + "__mov"} name={nombre(sr, true)} dataKey={sr + "__mov"} fill={NARANJA} radius={[3, 3, 0, 0]} isAnimationActive={false} />)}
          </BarChart>
        ) : (
          <LineChart data={datos} margin={margen}>
            {comun}
            {series.map((sr, i) => (
              <Line key={sr} name={nombre(sr, false)} dataKey={sr} stroke={COLORES[i % COLORES.length]} strokeWidth={2}
                dot={mini ? false : { r: 2.5 }} connectNulls isAnimationActive={false} />
            ))}
            {conMov && series.map((sr) => (
              <Line key={sr + "__mov"} name={nombre(sr, true)} dataKey={sr + "__mov"} stroke={NARANJA} strokeWidth={2.5}
                dot={mini ? { r: 2.5, fill: NARANJA, stroke: NARANJA } : { r: 3.5, fill: NARANJA, stroke: NARANJA }}
                connectNulls isAnimationActive={false} />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
      {conMov && (
        <p className="leyenda">
          <span><i style={{ background: COLORES[0] }} />Última snapshot</span>
          <span><i style={{ background: NARANJA }} />Últimos movimientos</span>
        </p>
      )}
    </>
  );
}
