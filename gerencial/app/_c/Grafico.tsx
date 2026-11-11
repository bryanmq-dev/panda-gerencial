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

/**
 * Dibuja el resultado de un KPI. Convención: la primera columna es el eje y
 * las demás son series numéricas.
 */
export default function Grafico({ cols, filas: todas, tipo, alto = 260, metas = [], mini = false }: {
  cols: string[]; filas: Celda[][]; tipo: string; alto?: number; metas?: Meta[]; mini?: boolean;
}) {
  // el mes en curso tiene datos parciales y haría caer cualquier curva: no se dibuja
  const mesAbierto = new Date().toLocaleDateString("sv-SE", { timeZone: "America/La_Paz" }).slice(0, 7) + "-01";
  const filas = todas.filter((f) => !(typeof f[0] === "string" && /^\d{4}-\d{2}-\d{2}/.test(f[0]) && f[0] >= mesAbierto));
  if (!filas.length) return <p className="tenue">La consulta no devolvió filas.</p>;
  const series = cols.slice(1);

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

  const datos = filas.map((f) => Object.fromEntries([["_x", eje(f[0])], ...series.map((s, i) => [s, f[i + 1]])]));
  const margen = mini ? { top: 4, right: 4, bottom: 0, left: 0 } : { top: 8, right: 16, bottom: 0, left: 0 };
  const comun = (
    <>
      {!mini && <CartesianGrid stroke="#e3eaee" vertical={false} />}
      <XAxis dataKey="_x" tick={{ fontSize: 12, fill: "#4a5a66" }} tickLine={false} axisLine={{ stroke: "#d5dee4" }} hide={mini}
        interval={tipo === "barra" ? 0 : "preserveStartEnd"}
        {...(tipo === "barra" && !mini && filas.length > 4 ? { angle: -30, textAnchor: "end" as const, height: 78 } : {})} />
      <YAxis tick={{ fontSize: 12, fill: "#4a5a66" }} tickLine={false} axisLine={false} width={48} tickFormatter={compacto} hide={mini}
        domain={tipo === "linea" ? ["auto", "auto"] : [0, "auto"]} />
      <Tooltip formatter={(v) => num(v)} contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: "#d5dee4" }} />
      {!mini && series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
      {metas.map((m) => (
        <ReferenceLine key={m.nombre} y={m.valor} stroke="#a33520" strokeDasharray="5 4"
          label={{ value: `Meta ${num(m.valor)}`, position: "insideTopRight", fontSize: 12, fill: "#a33520" }} />
      ))}
    </>
  );

  return (
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
          {series.map((s, i) => <Bar key={s} dataKey={s} fill={COLORES[i % COLORES.length]} radius={[3, 3, 0, 0]} isAnimationActive={false} />)}
        </BarChart>
      ) : (
        <LineChart data={datos} margin={margen}>
          {comun}
          {series.map((s, i) => (
            <Line key={s} dataKey={s} stroke={COLORES[i % COLORES.length]} strokeWidth={2} dot={mini ? false : { r: 2.5 }}
              connectNulls isAnimationActive={false} />
          ))}
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}
