-- ============================================================
-- Helados Panda · ALMACÉN DE DATOS (panda_dw)
-- Esquema estrella. Tres esquemas dentro de la base:
--   dw   dimensiones y hechos: lo único que ve el gerente (rol gerente_ro)
--   src  tablas foráneas hacia la base transaccional (postgres_fdw)
--   ctl  control: ETL, catálogo de KPI con versiones, objetivos (KGI)
-- ============================================================
CREATE SCHEMA dw;
CREATE SCHEMA src;
CREATE SCHEMA ctl;

-- ---------- origen: la base transaccional, de solo lectura ----------
CREATE EXTENSION postgres_fdw;
-- Mismo servidor, otra base: se conecta por el socket local.
CREATE SERVER oltp FOREIGN DATA WRAPPER postgres_fdw
  OPTIONS (host '/var/run/postgresql', dbname 'panda_oltp', fetch_size '5000');
CREATE USER MAPPING FOR CURRENT_USER SERVER oltp OPTIONS (user 'panda');
IMPORT FOREIGN SCHEMA public FROM SERVER oltp INTO src;

-- ---------- dimensiones ----------
-- La llave de cada dimensión es el id del origen: son catálogos pequeños
-- que el ETL recarga completos (tipo 1, sin historia de cambios).
CREATE TABLE dw.dim_fecha (
    fecha        date PRIMARY KEY,
    periodo      date NOT NULL,          -- primer día del mes: eje de las series
    anio         int NOT NULL,
    mes          int NOT NULL,
    nombre_mes   text NOT NULL,
    trimestre    int NOT NULL,
    dia_semana   int NOT NULL,           -- 1 = lunes
    nombre_dia   text NOT NULL,
    temporada    text NOT NULL           -- alta (oct–mar) | baja (abr–sep)
);
INSERT INTO dw.dim_fecha
SELECT d, date_trunc('month', d), extract(year FROM d), extract(month FROM d),
       (ARRAY['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[extract(month FROM d)::int],
       extract(quarter FROM d), extract(isodow FROM d),
       (ARRAY['lunes','martes','miércoles','jueves','viernes','sábado','domingo'])[extract(isodow FROM d)::int],
       CASE WHEN extract(month FROM d) IN (10,11,12,1,2,3) THEN 'alta' ELSE 'baja' END
FROM generate_series(date '2024-01-01', date '2030-12-31', interval '1 day') d;

CREATE TABLE dw.dim_producto (
    producto_id     int PRIMARY KEY,
    codigo          text NOT NULL,
    nombre          text NOT NULL,
    linea           text NOT NULL,
    litros_unidad   numeric(8,3) NOT NULL,
    precio_lista    numeric(10,2) NOT NULL,
    costo_estandar  numeric(10,4) NOT NULL
);
CREATE TABLE dw.dim_punto_venta (
    punto_venta_id  int PRIMARY KEY,
    nombre          text NOT NULL,
    canal           text NOT NULL,
    zona            text NOT NULL,
    municipio       text NOT NULL
);
CREATE TABLE dw.dim_empleado (
    empleado_id  int PRIMARY KEY,
    nombre       text NOT NULL,
    rol          text NOT NULL,
    zona         text
);
CREATE TABLE dw.dim_camara (
    camara_id  int PRIMARY KEY,
    nombre     text NOT NULL,
    ubicacion  text NOT NULL,
    temp_min   numeric(5,1) NOT NULL,
    temp_max   numeric(5,1) NOT NULL
);
CREATE TABLE dw.dim_lote (
    lote_id            bigint PRIMARY KEY,
    codigo             text NOT NULL,
    producto_id        int NOT NULL REFERENCES dw.dim_producto,
    camara_id          int REFERENCES dw.dim_camara,
    fecha_ingreso      date NOT NULL REFERENCES dw.dim_fecha,
    fecha_vencimiento  date,
    cantidad_inicial   int NOT NULL,
    costo_unitario     numeric(10,4) NOT NULL
);

-- ---------- hechos ----------
-- Grano: una visita del repartidor a un punto de venta.
CREATE TABLE dw.fact_visita (
    visita_id        bigint PRIMARY KEY,
    fecha            date NOT NULL REFERENCES dw.dim_fecha,
    hora             int NOT NULL,
    punto_venta_id   int NOT NULL REFERENCES dw.dim_punto_venta,
    vendedor_id      int NOT NULL REFERENCES dw.dim_empleado,
    realizada        boolean NOT NULL,
    motivo_no_venta  text,
    monto            numeric(12,2) NOT NULL
);
-- Grano: una línea de producto de una venta.
CREATE TABLE dw.fact_venta (
    detalle_id      bigint PRIMARY KEY,
    visita_id       bigint NOT NULL,
    fecha           date NOT NULL REFERENCES dw.dim_fecha,
    producto_id     int NOT NULL REFERENCES dw.dim_producto,
    punto_venta_id  int NOT NULL REFERENCES dw.dim_punto_venta,
    vendedor_id     int NOT NULL REFERENCES dw.dim_empleado,
    lote_id         bigint NOT NULL REFERENCES dw.dim_lote,
    cantidad        int NOT NULL,
    litros          numeric(12,3) NOT NULL,
    monto           numeric(12,2) NOT NULL,
    costo           numeric(12,2) NOT NULL,
    contribucion    numeric(12,2) NOT NULL
);
-- Grano: una lectura de temperatura de una cámara.
CREATE TABLE dw.fact_inspeccion (
    inspeccion_id   bigint PRIMARY KEY,
    fecha           date NOT NULL REFERENCES dw.dim_fecha,
    hora            int NOT NULL,
    camara_id       int NOT NULL REFERENCES dw.dim_camara,
    inspector_id    int NOT NULL REFERENCES dw.dim_empleado,
    temperatura     numeric(5,1) NOT NULL,
    fuera_de_rango  boolean NOT NULL
);
-- Grano: un lote dado de baja (total o parcialmente) en una inspección.
CREATE TABLE dw.fact_merma (
    merma_id       bigint PRIMARY KEY,
    fecha          date NOT NULL REFERENCES dw.dim_fecha,
    inspeccion_id  bigint NOT NULL,
    lote_id        bigint NOT NULL REFERENCES dw.dim_lote,
    producto_id    int NOT NULL REFERENCES dw.dim_producto,
    camara_id      int NOT NULL REFERENCES dw.dim_camara,
    causa          text NOT NULL,
    cantidad       int NOT NULL,
    costo_perdido  numeric(12,2) NOT NULL
);
CREATE INDEX ON dw.fact_venta (fecha);
CREATE INDEX ON dw.fact_visita (fecha);
CREATE INDEX ON dw.fact_merma (fecha);
CREATE INDEX ON dw.fact_inspeccion (fecha);

COMMENT ON TABLE dw.dim_fecha IS 'Calendario. periodo = primer día del mes, úselo como eje de series mensuales';
COMMENT ON TABLE dw.fact_visita IS 'Una fila por visita del repartidor; realizada indica si hubo venta';
COMMENT ON TABLE dw.fact_venta IS 'Una fila por línea de producto vendida. monto y costo en bolivianos';
COMMENT ON TABLE dw.fact_inspeccion IS 'Una fila por lectura de temperatura de una cámara de frío';
COMMENT ON TABLE dw.fact_merma IS 'Una fila por lote dado de baja en una inspección. costo_perdido en bolivianos';

-- ---------- el rol del gerente: solo lectura, solo el esquema dw ----------
CREATE ROLE gerente_ro LOGIN PASSWORD 'gerente_ro';
REVOKE CONNECT ON DATABASE panda_oltp FROM PUBLIC;
GRANT USAGE ON SCHEMA dw TO gerente_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA dw TO gerente_ro;
ALTER ROLE gerente_ro SET default_transaction_read_only = on;
ALTER ROLE gerente_ro SET statement_timeout = '8s';
