import assert from "node:assert/strict";
import { test } from "node:test";
import { esSerie, evaluar } from "./kgi.ts";

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
