// Lógica pura de objetivos (KGI): sin base de datos, para poder probarla sola.
// node --test lib/kgi.test.ts

export type Celda = string | number | null;
export type Kgi = { meta: number; desde: string; hasta: string; valor_base?: number | null };
export type Evaluacion = {
  base: number | null;      // valor del KPI cuando empezó la operación
  actual: number | null;    // último mes cerrado dentro de la ventana
  avance: number;           // 0..1 del camino entre base y meta
  cumple: boolean;
  periodo: string | null;   // mes del valor actual
  vencido: boolean;
};

const ES_FECHA = /^\d{4}-\d{2}-\d{2}/;

/** Un resultado es una serie si su primera columna es una fecha. */
export const esSerie = (filas: Celda[][]) => filas.length > 0 && typeof filas[0][0] === "string" && ES_FECHA.test(filas[0][0]);

/**
 * Compara un KPI de serie mensual contra su objetivo, desde el mes en que
 * empezó la operación. Solo cuentan meses cerrados: el mes en curso tiene
 * datos parciales y haría caer cualquier suma. Con `incluirAbierto` se mide también
 * el mes en curso a la fecha: es la lectura en vivo, fuera del último snapshot.
 */
export function evaluar(kgi: Kgi, sentido: "mayor" | "menor", filas: Celda[][], hoy: string, incluirAbierto = false): Evaluacion {
  const mes = (f: string) => f.slice(0, 7) + "-01";
  const puntos = filas
    .filter((f) => typeof f[0] === "string" && typeof f[1] === "number")
    .map((f) => ({ x: (f[0] as string).slice(0, 10), y: f[1] as number }))
    .filter((p) => p.x >= mes(kgi.desde) && p.x <= kgi.hasta && (incluirAbierto || p.x < mes(hoy)));
  const vencido = hoy > kgi.hasta;
  if (!puntos.length) return { base: null, actual: null, avance: 0, cumple: false, periodo: null, vencido };

  // valor de inicio: el que tenía el KPI al abrir la operación. Sin él (objetivos antiguos),
  // el del mes de inicio, que si empieza en el mes en curso coincide con el actual y deja el avance en cero.
  const base = kgi.valor_base ?? puntos[0].y;
  const { x: periodo, y: actual } = puntos[puntos.length - 1];
  const cumple = sentido === "mayor" ? actual >= kgi.meta : actual <= kgi.meta;
  // base ya en la meta: no hay camino que medir, solo si se sostiene o no
  const tramo = kgi.meta - base;
  const avance = cumple ? 1 : tramo === 0 ? 0 : Math.min(1, Math.max(0, (actual - base) / tramo));
  return { base, actual, avance, cumple, periodo, vencido };
}

/**
 * Valor que tiene el indicador en el periodo de una fecha: el del mes que la
 * contiene (la serie es mensual; en el mes en curso es el valor a la fecha).
 * Sin dato para ese mes, undefined: el formulario deja el campo vacío.
 */
export function valorEnFecha(filas: Celda[][], fecha: string): number | undefined {
  const mes = fecha.slice(0, 7);
  const f = filas.find((r) => typeof r[0] === "string" && r[0].slice(0, 7) === mes && typeof r[1] === "number");
  return f ? (f[1] as number) : undefined;
}
