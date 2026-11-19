import assert from "node:assert/strict";
import { test } from "node:test";
import { combinar, programacion } from "./snapshot-reglas.ts";

test("un snapshot manual no mueve el turno programado: el 12 sigue tocando el 26", () => {
  assert.deepEqual(programacion("2026-11-12", 26, false), { proxima: "2026-11-26", vencida: false });
});
test("llegado el día se vence, y tomado el programado el siguiente es el del mes que viene", () => {
  assert.deepEqual(programacion("2026-11-26", 26, false), { proxima: "2026-11-26", vencida: true });
  assert.deepEqual(programacion("2026-11-30", 26, true), { proxima: "2026-12-26", vencida: false });
  assert.deepEqual(programacion("2026-12-27", 26, true), { proxima: "2027-01-26", vencida: false });
});
test("si el servicio estuvo caído, el turno vencido se toma al volver", () => {
  assert.equal(programacion("2026-11-29", 26, false).vencida, true);
});

const foto = [["2026-09-01", 70], ["2026-10-01", 72], ["2026-11-01", 74]];
test("combinar: sin cambios no hay línea naranja", () => {
  assert.equal(combinar(foto, foto).movimientos, null);
});
test("combinar: movimientos parten del punto anterior y llegan al valor de hoy", () => {
  const vivo = [["2026-09-01", 70], ["2026-10-01", 72], ["2026-11-01", 76]];
  assert.deepEqual(combinar(foto, vivo).movimientos, [["2026-10-01", 72], ["2026-11-01", 76]]);
});
test("combinar: un mes nuevo después de la foto también es movimiento", () => {
  const vivo = [...foto, ["2026-12-01", 5]];
  assert.deepEqual(combinar(foto, vivo).movimientos, [["2026-10-01", 72], ["2026-11-01", 74], ["2026-12-01", 5]]);
});
test("combinar: sin foto se dibuja la lectura en vivo como base", () => {
  assert.deepEqual(combinar([], foto), { snapshot: foto, movimientos: null });
});

test("combinar por categoría: devuelve la lectura en vivo solo si algo cambió", () => {
  const zonas = [["El Alto Norte", 100], ["Zona Sur", 50]];
  assert.equal(combinar(zonas, zonas).movimientos, null);
  assert.deepEqual(combinar(zonas, [["El Alto Norte", 120], ["Zona Sur", 50]]).movimientos, [["El Alto Norte", 120], ["Zona Sur", 50]]);
});
