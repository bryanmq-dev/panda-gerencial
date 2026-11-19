-- ============================================================
-- Control gerencial: catálogo de KPI (con versiones) y objetivos (KGI).
--
-- Un KPI es una consulta SQL guardada sobre el esquema dw. Convención:
--   · primera columna = eje (un `periodo` de dim_fecha para series, o una
--     etiqueta de texto para comparaciones)
--   · columnas siguientes = valores numéricos
-- Un KGI es una meta sobre un KPI de serie, con ventana desde–hasta: la
-- comparación arranca en el valor que el KPI tenía en `desde`.
-- ============================================================

CREATE TABLE ctl.kpi (
    id              serial PRIMARY KEY,
    nombre          text NOT NULL,
    descripcion     text NOT NULL DEFAULT '',
    unidad          text NOT NULL DEFAULT '',        -- Bs, %, L, u…
    tipo_medida     text NOT NULL DEFAULT 'operativa', -- monetaria | operativa | comercial | calidad
    sentido         text NOT NULL DEFAULT 'mayor',   -- mayor | menor: qué dirección es mejorar
    version_actual  int NOT NULL DEFAULT 1,
    archivado       boolean NOT NULL DEFAULT false,
    creado_en       timestamptz NOT NULL DEFAULT now()
);

-- Cada guardado es una versión nueva: la consulta anterior nunca se pisa.
CREATE TABLE ctl.kpi_version (
    id         serial PRIMARY KEY,
    kpi_id     int NOT NULL REFERENCES ctl.kpi ON DELETE CASCADE,
    version    int NOT NULL,
    sql        text NOT NULL,
    grafico    text NOT NULL DEFAULT 'linea',        -- linea | barra | torta | tabla
    origen     text NOT NULL DEFAULT 'manual',       -- sistema | manual | ia
    nota       text NOT NULL DEFAULT '',
    creado_en  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (kpi_id, version)
);

CREATE TABLE ctl.kgi (
    id           serial PRIMARY KEY,
    kpi_id       int NOT NULL REFERENCES ctl.kpi ON DELETE CASCADE,
    nombre       text NOT NULL,
    descripcion  text NOT NULL DEFAULT '',
    tipo_medida  text NOT NULL,
    meta         numeric NOT NULL,
    valor_base   numeric,                -- valor del KPI al abrir la operación; de ahí se mide el avance
    desde        date NOT NULL,
    hasta        date NOT NULL,
    cerrado      boolean NOT NULL DEFAULT false,
    creado_en    timestamptz NOT NULL DEFAULT now()
);

-- ---------- KPI de fábrica ----------
CREATE FUNCTION pg_temp.kpi(p_nombre text, p_desc text, p_unidad text, p_tipo text, p_sentido text, p_grafico text, p_sql text)
RETURNS void LANGUAGE sql AS $$
  WITH k AS (INSERT INTO ctl.kpi (nombre, descripcion, unidad, tipo_medida, sentido)
             VALUES (p_nombre, p_desc, p_unidad, p_tipo, p_sentido) RETURNING id)
  INSERT INTO ctl.kpi_version (kpi_id, version, sql, grafico, origen, nota)
  SELECT id, 1, p_sql, p_grafico, 'sistema', 'Versión inicial' FROM k
$$;

SELECT pg_temp.kpi('Ventas netas', 'Ingreso mensual por ventas', 'Bs', 'monetaria', 'mayor', 'linea',
$$SELECT f.periodo, sum(v.monto) AS ventas_bs
FROM dw.fact_venta v
JOIN dw.dim_fecha f ON f.fecha = v.fecha
GROUP BY f.periodo
ORDER BY f.periodo$$);

SELECT pg_temp.kpi('Ventas por línea', 'Estacionalidad: el helado cae en invierno, el yogurt no', 'Bs', 'monetaria', 'mayor', 'linea',
$$SELECT f.periodo,
       sum(v.monto) FILTER (WHERE p.linea = 'Helados') AS helados,
       sum(v.monto) FILTER (WHERE p.linea = 'Yogurt')  AS yogurt,
       sum(v.monto) FILTER (WHERE p.linea = 'Agua')    AS agua
FROM dw.fact_venta v
JOIN dw.dim_fecha f ON f.fecha = v.fecha
JOIN dw.dim_producto p ON p.producto_id = v.producto_id
GROUP BY f.periodo
ORDER BY f.periodo$$);

SELECT pg_temp.kpi('Margen de contribución', 'Contribución sobre ventas', '%', 'monetaria', 'mayor', 'linea',
$$SELECT f.periodo, round(100 * sum(v.contribucion) / sum(v.monto), 1) AS margen_pct
FROM dw.fact_venta v
JOIN dw.dim_fecha f ON f.fecha = v.fecha
GROUP BY f.periodo
ORDER BY f.periodo$$);

SELECT pg_temp.kpi('Conversión de visita en venta', 'Visitas que terminan en venta', '%', 'comercial', 'mayor', 'linea',
$$SELECT f.periodo, round(100.0 * count(*) FILTER (WHERE v.realizada) / count(*), 1) AS conversion_pct
FROM dw.fact_visita v
JOIN dw.dim_fecha f ON f.fecha = v.fecha
GROUP BY f.periodo
ORDER BY f.periodo$$);

SELECT pg_temp.kpi('Puntos de venta activos', 'Puntos de venta con al menos una compra en el mes', 'u', 'comercial', 'mayor', 'linea',
$$SELECT f.periodo, count(DISTINCT v.punto_venta_id) AS puntos_activos
FROM dw.fact_visita v
JOIN dw.dim_fecha f ON f.fecha = v.fecha
WHERE v.realizada
GROUP BY f.periodo
ORDER BY f.periodo$$);

SELECT pg_temp.kpi('Merma valorizada', 'Costo del producto dado de baja en las inspecciones', 'Bs', 'calidad', 'menor', 'linea',
$$SELECT f.periodo, sum(m.costo_perdido) AS merma_bs
FROM dw.fact_merma m
JOIN dw.dim_fecha f ON f.fecha = m.fecha
GROUP BY f.periodo
ORDER BY f.periodo$$);

SELECT pg_temp.kpi('Merma sobre costo vendido', 'Costo perdido por merma como porcentaje del costo de lo vendido', '%', 'calidad', 'menor', 'linea',
$$SELECT m.periodo, round(100 * m.merma / v.costo, 2) AS merma_pct
FROM (SELECT f.periodo, sum(x.costo_perdido) AS merma
      FROM dw.fact_merma x JOIN dw.dim_fecha f ON f.fecha = x.fecha GROUP BY f.periodo) m
JOIN (SELECT f.periodo, sum(x.costo) AS costo
      FROM dw.fact_venta x JOIN dw.dim_fecha f ON f.fecha = x.fecha GROUP BY f.periodo) v ON v.periodo = m.periodo
ORDER BY m.periodo$$);

SELECT pg_temp.kpi('Lecturas fuera de rango', 'Inspecciones con la cámara fuera de su rango de temperatura', '%', 'calidad', 'menor', 'linea',
$$SELECT f.periodo, round(100.0 * count(*) FILTER (WHERE i.fuera_de_rango) / count(*), 1) AS fuera_pct
FROM dw.fact_inspeccion i
JOIN dw.dim_fecha f ON f.fecha = i.fecha
GROUP BY f.periodo
ORDER BY f.periodo$$);

SELECT pg_temp.kpi('Ventas por zona', 'Últimos doce meses', 'Bs', 'comercial', 'mayor', 'barra',
$$SELECT pv.zona, sum(v.monto) AS ventas_bs
FROM dw.fact_venta v
JOIN dw.dim_punto_venta pv ON pv.punto_venta_id = v.punto_venta_id
GROUP BY pv.zona
ORDER BY ventas_bs DESC$$);

SELECT pg_temp.kpi('Motivos de no venta', 'Por qué una visita no termina en venta', 'u', 'comercial', 'menor', 'barra',
$$SELECT v.motivo_no_venta AS motivo, count(*) AS visitas
FROM dw.fact_visita v
WHERE NOT v.realizada
GROUP BY v.motivo_no_venta
ORDER BY visitas DESC$$);

SELECT pg_temp.kpi('Merma por causa', 'Dónde se pierde el producto', 'Bs', 'calidad', 'menor', 'torta',
$$SELECT m.causa, sum(m.costo_perdido) AS merma_bs
FROM dw.fact_merma m
GROUP BY m.causa
ORDER BY merma_bs DESC$$);

SELECT pg_temp.kpi('Merma por cámara', 'Costo perdido y lecturas fuera de rango por cámara', 'Bs', 'calidad', 'menor', 'barra',
$$SELECT c.nombre AS camara, sum(m.costo_perdido) AS merma_bs
FROM dw.fact_merma m
JOIN dw.dim_camara c ON c.camara_id = m.camara_id
GROUP BY c.nombre
ORDER BY c.nombre$$);

-- ---------- primera carga y dos objetivos de ejemplo ----------
SELECT ctl.etl_ejecutar('inicial');

INSERT INTO ctl.kgi (kpi_id, nombre, descripcion, tipo_medida, meta, desde, hasta)
SELECT id, 'Llevar la conversión a 75 %', 'Plan de rutas: visitar con stock y cambio suficiente', 'comercial', 75,
       date_trunc('month', current_date - 180)::date, (date_trunc('month', current_date) + interval '3 months')::date
FROM ctl.kpi WHERE nombre = 'Conversión de visita en venta';

INSERT INTO ctl.kgi (kpi_id, nombre, descripcion, tipo_medida, meta, desde, hasta)
SELECT id, 'Lecturas fuera de rango bajo 4 %', 'Mantenimiento preventivo de las cámaras tras la falla de la cámara 3', 'calidad', 4,
       date_trunc('month', current_date - 240)::date, (date_trunc('month', current_date) + interval '2 months')::date
FROM ctl.kpi WHERE nombre = 'Lecturas fuera de rango';

SELECT id, origen, estado, filas, error, fin - inicio AS duracion FROM ctl.etl_corrida;
