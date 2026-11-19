-- ============================================================
-- Snapshots: fotos congeladas de todos los KPI.
--
-- El tablero dibuja dos cosas: lo que decía el último snapshot y, encima, lo
-- que se movió desde entonces (lectura en vivo del almacén). Crear un snapshot
-- consolida: la foto pasa a ser el estado actual.
--
-- Calendario: un snapshot programado por mes, el día `dia_mes`. Uno manual
-- no ocupa ese turno: si hoy es 12 y el programado es el 26, el siguiente sigue
-- siendo el 26.
-- ============================================================

CREATE TABLE ctl.snapshot_config (
    id       boolean PRIMARY KEY DEFAULT true CHECK (id),     -- una sola fila
    dia_mes  int NOT NULL DEFAULT 26 CHECK (dia_mes BETWEEN 1 AND 28),
    activo   boolean NOT NULL DEFAULT true
);
INSERT INTO ctl.snapshot_config DEFAULT VALUES;

CREATE TABLE ctl.snapshot (
    id         serial PRIMARY KEY,
    creado_en  timestamptz NOT NULL DEFAULT now(),
    corte      date NOT NULL,                       -- día (hora de Bolivia) al que corresponde la foto
    periodo    date NOT NULL,                       -- primer día de ese mes
    origen     text NOT NULL                        -- inicial | programado | manual
);
-- un solo turno programado por mes, aunque dos procesos lo intenten a la vez
CREATE UNIQUE INDEX snapshot_un_programado_por_mes ON ctl.snapshot (periodo) WHERE origen = 'programado';

CREATE TABLE ctl.snapshot_kpi (
    snapshot_id  int NOT NULL REFERENCES ctl.snapshot ON DELETE CASCADE,
    kpi_id       int NOT NULL REFERENCES ctl.kpi ON DELETE CASCADE,
    version      int NOT NULL,                      -- versión del KPI cuando se tomó la foto
    cols         jsonb NOT NULL,
    filas        jsonb NOT NULL,
    PRIMARY KEY (snapshot_id, kpi_id)
);
