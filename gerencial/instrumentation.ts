// Programador del ETL: la aplicación pregunta cada 20 s y la base decide si
// ya toca (ctl.etl_tick lee el intervalo configurado en la pantalla de ETL).
// ponytail: un temporizador en el proceso web. Con varias réplicas todas
// preguntan, pero el candado de la base deja correr una sola; si el ETL crece,
// pasa a un cron o a un worker aparte.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { dw } = await import("./lib/db");
  const { snapshotTick } = await import("./lib/snapshot");
  setInterval(() => {
    dw.query("SELECT ctl.etl_tick()")
      .then(() => snapshotTick())     // el snapshot inicial y el programado de cada mes
      .catch((e) => console.error("ETL/snapshot:", e.message));
  }, 20_000);
}
