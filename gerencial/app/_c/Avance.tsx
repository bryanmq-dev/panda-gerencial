/**
 * Avance hacia la meta en dos tramos: el del último snapshot (azul) y lo que
 * se movió después (naranja). Si hoy está por debajo del snapshot, el tramo
 * naranja va rayado y marca lo que se perdió.
 */
export default function Avance({ snap, hoy, cumple }: { snap: number; hoy: number; cumple: boolean }) {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const base = Math.min(snap, hoy), tope = Math.max(snap, hoy);
  const cambia = Math.abs(hoy - snap) >= 0.005;
  return (
    <>
      <div className={`progreso dual ${cumple ? "bien" : ""}`} title={`Snapshot ${pct(snap)} · hoy ${pct(hoy)}`}>
        <i className="snap" style={{ width: pct(base) }} />
        {cambia && <i className={`mov ${hoy < snap ? "baja" : ""}`} style={{ left: pct(base), width: pct(tope - base) }} />}
      </div>
      <span className="tenue">
        {pct(snap)} en el snapshot{cambia && <> · <strong style={{ color: "var(--movimiento)" }}>{pct(hoy)} hoy</strong></>}
      </span>
    </>
  );
}
