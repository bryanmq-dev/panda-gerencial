// Reglas puras de los snapshots: sin base de datos, para poder probarlas solas.
// node --test lib/snapshot-reglas.test.ts
import type { Celda } from "./db";

/** Fecha 'AAAA-MM-DD' del turno programado del mes de `hoy`. */
export const turnoDelMes = (hoy: string, dia: number) => `${hoy.slice(0, 7)}-${String(dia).padStart(2, "0")}`;

function mesSiguiente(hoy: string) {
  const y = Number(hoy.slice(0, 4)), m = Number(hoy.slice(5, 7));
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/**
 * Cuándo toca el snapshot programado. Un snapshot manual no ocupa el turno:
 * solo cuenta el programado del mes. `vencida` = ya pasó el día y falta tomarlo.
 */
export function programacion(hoy: string, dia: number, hayProgramadoEsteMes: boolean) {
  const turno = turnoDelMes(hoy, dia);
  if (!hayProgramadoEsteMes && hoy >= turno) return { proxima: turno, vencida: true };
  if (!hayProgramadoEsteMes) return { proxima: turno, vencida: false };
  return { proxima: turnoDelMes(mesSiguiente(hoy), dia), vencida: false };
}

export type Par = { snapshot: Celda[][]; movimientos: Celda[][] | null };

/**
 * Une la foto con la lectura en vivo para dibujar una sola línea: la foto
 * llega hasta su último punto y los movimientos parten del punto anterior (así
 * la línea naranja sigue a la azul) y llegan al valor de hoy. Si nada se movió,
 * no hay línea naranja. En comparaciones por categoría, los movimientos son la
 * lectura en vivo completa, y solo si algo cambió.
 */
export function combinar(snapshot: Celda[][], vivo: Celda[][]): Par {
  if (snapshot.length < 1 || vivo.length < 1) return { snapshot: snapshot.length ? snapshot : vivo, movimientos: null };
  // categorías (zona, causa…): no hay línea que continuar; se comparan las barras enteras
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(snapshot[0][0]))) {
    return { snapshot, movimientos: JSON.stringify(snapshot) === JSON.stringify(vivo) ? null : vivo };
  }
  const x = (f: Celda[]) => String(f[0]);
  const ultimo = snapshot[snapshot.length - 1];
  const ancla = snapshot.length > 1 ? x(snapshot[snapshot.length - 2]) : x(ultimo);

  const enVivo = vivo.find((f) => x(f) === x(ultimo));
  const hayNuevos = vivo.some((f) => x(f) > x(ultimo));
  const cambio = !!enVivo && enVivo.some((v, i) => i > 0 && v !== ultimo[i]);
  if (!hayNuevos && !cambio) return { snapshot, movimientos: null };
  return { snapshot, movimientos: vivo.filter((f) => x(f) >= ancla) };
}
