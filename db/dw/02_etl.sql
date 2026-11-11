-- ============================================================
-- ETL incremental: base transaccional → almacén.
--
-- Extracción por MARCA DE AGUA: de cada tabla de movimiento se guarda el
-- último id cargado y la corrida siguiente lee solo `id > marca`. No se
-- comparan filas ni se recorre la historia: el costo es proporcional a lo
-- nuevo, no al tamaño de la tabla.
--
-- Toda la corrida es una transacción: postgres_fdw lee el origen con una
-- sola instantánea (REPEATABLE READ), así que dimensiones y hechos salen del
-- mismo instante y un hecho nunca apunta a una dimensión que aún no llegó.
--
-- ponytail: supone origen de solo-inserción. Un UPDATE o DELETE en el origen
-- no se propaga, y una transacción que tarde en confirmar con un id menor al
-- último leído se pierde. Si el origen empieza a editar filas: columna
-- actualizado_en + marca por fecha, o CDC por replicación lógica.
-- ============================================================

CREATE TABLE ctl.etl_config (
    id             boolean PRIMARY KEY DEFAULT true CHECK (id),   -- una sola fila
    intervalo_min  int NOT NULL DEFAULT 5,
    activo         boolean NOT NULL DEFAULT true
);
INSERT INTO ctl.etl_config DEFAULT VALUES;

CREATE TABLE ctl.etl_marca (
    tabla        text PRIMARY KEY,
    ultimo_id    bigint NOT NULL DEFAULT 0,
    actualizado  timestamptz
);
INSERT INTO ctl.etl_marca (tabla) VALUES ('venta'), ('venta_detalle'), ('inspeccion'), ('merma');

CREATE TABLE ctl.etl_corrida (
    id      bigserial PRIMARY KEY,
    inicio  timestamptz NOT NULL DEFAULT clock_timestamp(),
    fin     timestamptz,
    origen  text NOT NULL,                 -- programado | manual | inicial
    estado  text NOT NULL DEFAULT 'en curso',
    filas   jsonb NOT NULL DEFAULT '{}',
    error   text
);

-- Carga un hecho: lee id > marca, inserta, avanza la marca. Devuelve filas cargadas.
-- `consulta` debe exponer la columna id del origen como primera columna del hecho.
CREATE FUNCTION ctl.etl_hecho(tabla_origen text, destino text, consulta text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE marca bigint; tope bigint; n bigint;
BEGIN
  SELECT ultimo_id INTO marca FROM ctl.etl_marca WHERE tabla = tabla_origen;
  EXECUTE format('SELECT coalesce(max(id), %s) FROM src.%I WHERE id > %s', marca, tabla_origen, marca) INTO tope;
  EXECUTE format('INSERT INTO dw.%I %s', destino, consulta) USING marca, tope;
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE ctl.etl_marca SET ultimo_id = tope, actualizado = now() WHERE tabla = tabla_origen;
  RETURN n;
END $$;

CREATE FUNCTION ctl.etl_ejecutar(p_origen text DEFAULT 'manual') RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE corrida bigint; n bigint; f jsonb := '{}';
BEGIN
  IF NOT pg_try_advisory_xact_lock(7741) THEN RETURN NULL; END IF;   -- ya hay una corrida
  INSERT INTO ctl.etl_corrida (origen) VALUES (p_origen) RETURNING id INTO corrida;
  BEGIN
    -- 1) dimensiones: catálogos pequeños, se recargan completos
    INSERT INTO dw.dim_producto
    SELECT id, codigo, nombre, linea, litros_unidad, precio, costo FROM src.producto
    ON CONFLICT (producto_id) DO UPDATE SET codigo = excluded.codigo, nombre = excluded.nombre, linea = excluded.linea,
      litros_unidad = excluded.litros_unidad, precio_lista = excluded.precio_lista, costo_estandar = excluded.costo_estandar;

    INSERT INTO dw.dim_punto_venta
    SELECT p.id, p.nombre, p.canal, z.nombre, z.municipio FROM src.punto_venta p JOIN src.zona z ON z.id = p.zona_id
    ON CONFLICT (punto_venta_id) DO UPDATE SET nombre = excluded.nombre, canal = excluded.canal,
      zona = excluded.zona, municipio = excluded.municipio;

    INSERT INTO dw.dim_empleado
    SELECT u.id, u.nombre, u.rol, z.nombre FROM src.usuario u LEFT JOIN src.zona z ON z.id = u.zona_id
    ON CONFLICT (empleado_id) DO UPDATE SET nombre = excluded.nombre, rol = excluded.rol, zona = excluded.zona;

    INSERT INTO dw.dim_camara
    SELECT id, nombre, ubicacion, temp_min, temp_max FROM src.camara
    ON CONFLICT (camara_id) DO UPDATE SET nombre = excluded.nombre, ubicacion = excluded.ubicacion,
      temp_min = excluded.temp_min, temp_max = excluded.temp_max;

    -- los lotes no cambian después de ingresar: solo los nuevos
    INSERT INTO dw.dim_lote
    SELECT id, codigo, producto_id, camara_id, fecha_ingreso, fecha_vencimiento, cantidad, costo_unitario
    FROM src.lote WHERE id > (SELECT coalesce(max(lote_id), 0) FROM dw.dim_lote);
    GET DIAGNOSTICS n = ROW_COUNT;
    f := f || jsonb_build_object('dim_lote', n);

    -- 2) hechos: solo id > marca
    f := f || jsonb_build_object('fact_visita', ctl.etl_hecho('venta', 'fact_visita', $q$
      SELECT v.id, v.fecha::date, extract(hour FROM v.fecha)::int, v.punto_venta_id, v.vendedor_id,
             v.realizada, v.motivo_no_venta, v.total
      FROM src.venta v WHERE v.id > $1 AND v.id <= $2 $q$));

    f := f || jsonb_build_object('fact_venta', ctl.etl_hecho('venta_detalle', 'fact_venta', $q$
      SELECT d.id, d.venta_id, v.fecha::date, d.producto_id, v.punto_venta_id, v.vendedor_id, d.lote_id,
             d.cantidad, d.cantidad * p.litros_unidad, d.cantidad * d.precio_unitario,
             round(d.cantidad * l.costo_unitario, 2),
             d.cantidad * d.precio_unitario - round(d.cantidad * l.costo_unitario, 2)
      FROM src.venta_detalle d
      JOIN src.venta v ON v.id = d.venta_id
      JOIN src.producto p ON p.id = d.producto_id
      JOIN src.lote l ON l.id = d.lote_id
      WHERE d.id > $1 AND d.id <= $2 $q$));

    f := f || jsonb_build_object('fact_inspeccion', ctl.etl_hecho('inspeccion', 'fact_inspeccion', $q$
      SELECT i.id, i.fecha::date, extract(hour FROM i.fecha)::int, i.camara_id, i.inspector_id, i.temperatura,
             i.temperatura NOT BETWEEN c.temp_min AND c.temp_max
      FROM src.inspeccion i JOIN src.camara c ON c.id = i.camara_id
      WHERE i.id > $1 AND i.id <= $2 $q$));

    f := f || jsonb_build_object('fact_merma', ctl.etl_hecho('merma', 'fact_merma', $q$
      SELECT m.id, i.fecha::date, m.inspeccion_id, m.lote_id, l.producto_id, i.camara_id, m.causa, m.cantidad,
             round(m.cantidad * l.costo_unitario, 2)
      FROM src.merma m
      JOIN src.inspeccion i ON i.id = m.inspeccion_id
      JOIN src.lote l ON l.id = m.lote_id
      WHERE m.id > $1 AND m.id <= $2 $q$));

    UPDATE ctl.etl_corrida SET fin = clock_timestamp(), estado = 'ok', filas = f WHERE id = corrida;
  EXCEPTION WHEN OTHERS THEN
    -- el bloque se deshace entero (hechos y marcas); queda el registro del error
    UPDATE ctl.etl_corrida SET fin = clock_timestamp(), estado = 'error', error = SQLERRM WHERE id = corrida;
  END;
  RETURN corrida;
END $$;

-- Lo llama la aplicación gerencial cada pocos segundos: corre solo si ya toca.
CREATE FUNCTION ctl.etl_tick() RETURNS bigint LANGUAGE sql AS $$
  SELECT ctl.etl_ejecutar('programado')
  FROM ctl.etl_config c
  WHERE c.activo
    AND coalesce((SELECT max(inicio) FROM ctl.etl_corrida), '-infinity') <= now() - c.intervalo_min * interval '1 minute'
$$;
