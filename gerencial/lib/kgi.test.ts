import assert from "node:assert/strict";
import { test } from "node:test";
import { esSerie, evaluar, valorEnFecha } from "./kgi.ts";

const serie = [["2026-06-01", 60], ["2026-07-01", 64], ["2026-08-01", 70], ["2026-09-01", 73], ["2026-10-01", 40]];
const kgi = { meta: 80, desde: "2026-07-15", hasta: "2026-12-31" };

test("la comparación arranca en el mes de inicio y deja fuera el mes en curso", () => {
  const e = evaluar(kgi, "mayor", serie, "2026-10-20");   // octubre está abierto: no cuenta
  assert.equal(e.base, 64);
  assert.equal(e.actual, 73);
  assert.equal(e.periodo, "2026-09-01");
  assert.equal(e.avance, (73 - 64) / (80 - 64));
  assert.equal(e.cumple, false);
  assert.equal(e.vencido, false);
});

test("sentido menor: cumple cuando baja hasta la meta", () => {
  const e = evaluar({ meta: 65, desde: "2026-08-01", hasta: "2026-09-30" }, "menor", [["2026-08-01", 70], ["2026-09-01", 64]], "2026-11-02");
  assert.deepEqual([e.base, e.actual, e.avance, e.cumple, e.vencido], [70, 64, 1, true, true]);
});

test("retroceso: el avance no baja de cero; sin puntos no hay evaluación", () => {
  assert.equal(evaluar({ meta: 80, desde: "2026-06-01", hasta: "2026-12-31" }, "mayor", [["2026-06-01", 60], ["2026-07-01", 50]], "2026-08-05").avance, 0);
  assert.equal(evaluar(kgi, "mayor", [], "2026-10-20").actual, null);
});

test("esSerie distingue series de comparaciones por categoría", () => {
  assert.equal(esSerie(serie), true);
  assert.equal(esSerie([["El Alto Norte", 10]]), false);
});

test("incluirAbierto mide el mes en curso a la fecha (lectura en vivo)", () => {
  const e = evaluar(kgi, "mayor", serie, "2026-10-20", true);   // octubre abierto: 40
  assert.equal(e.actual, 40);
  assert.equal(e.periodo, "2026-10-01");
  assert.equal(e.avance, 0);                                    // retrocedió: no baja de cero
});

test("objetivo abierto en el mes en curso: el avance parte del valor al abrirlo, no del promedio del mes", () => {
  const vivo = [["2026-10-01", 72], ["2026-11-01", 75.78]];
  const sinBase = evaluar({ meta: 80, desde: "2026-11-12", hasta: "2027-01-26" }, "mayor", vivo, "2026-11-12", true);
  assert.equal(sinBase.avance, 0);                                  // el defecto: base y actual son el mismo punto
  const conBase = { meta: 80, desde: "2026-11-12", hasta: "2027-01-26", valor_base: 75.7 };
  const e = evaluar(conBase, "mayor", vivo, "2026-11-12", true);
  assert.equal(e.base, 75.7);
  assert.equal(e.actual, 75.78);
  assert.ok(Math.abs(e.avance - (75.78 - 75.7) / (80 - 75.7)) < 1e-9);   // ya se mueve con cada venta
});

test("valorEnFecha: el valor del mes de la fecha; sin dato, nada", () => {
  const filas = [["2026-09-01", 71.55], ["2026-10-01", 72.02], ["2026-11-01", 75.78]];
  assert.equal(valorEnFecha(filas, "2026-10-17"), 72.02);
  assert.equal(valorEnFecha(filas, "2026-11-12"), 75.78);
  assert.equal(valorEnFecha(filas, "2026-08-31"), undefined);   // antes de que existan datos
  assert.equal(valorEnFecha(filas, "2027-01-05"), undefined);   // mes sin datos todavía
});
