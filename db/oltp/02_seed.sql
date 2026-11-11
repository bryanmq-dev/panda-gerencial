-- ============================================================
-- Seeder de la base transaccional: ~100 mil filas, un año de operación
-- que termina ayer. Determinista (setseed) salvo por la fecha de corte.
--
-- DATOS SIMULADOS con fines académicos. Lo único tomado de fuentes públicas
-- es el contexto de la empresa (ver README): INAL Ltda., El Alto, fundada
-- en 1988, y el producto "Tropical 65 ml". Precios, costos, clientes,
-- ventas, temperaturas y mermas son inventados, con forma realista:
-- estacionalidad del helado, yogurt en alza, conversión de visita que mejora
-- y una cámara que falla durante seis semanas.
-- ============================================================
SELECT setseed(0.2026);

-- ---------- catálogos ----------
INSERT INTO zona (nombre, municipio) VALUES
 ('El Alto Norte','El Alto'), ('El Alto Sur','El Alto'), ('La Paz Centro','La Paz'),
 ('Villa Fátima','La Paz'), ('Zona Sur','La Paz'), ('Max Paredes','La Paz');

INSERT INTO producto (codigo, nombre, linea, litros_unidad, precio, costo) VALUES
 ('H01','Paleta de agua limón',        'Helados',0.075, 1.95, 1.40),
 ('H02','Paleta de crema chocolate',   'Helados',0.080, 2.40, 1.75),
 ('H03','Cono vainilla',               'Helados',0.110, 3.00, 2.15),
 ('H04','Bidón familiar de crema 5 L', 'Helados',5.000,65.00,48.00),
 ('H05','Sándwich helado',             'Helados',0.120, 3.45, 2.40),
 ('H06','Tropical 65 ml',              'Helados',0.065, 1.50, 1.05),
 ('Y01','Yogurt bebible frutilla 1 L', 'Yogurt', 1.000,13.00, 9.60),
 ('Y02','Yogurt bebible durazno 1 L',  'Yogurt', 1.000,13.00, 9.40),
 ('Y03','Yogurt firme vainilla 150 g', 'Yogurt', 0.150, 2.80, 2.00),
 ('A01','Agua purificada 600 ml',      'Agua',   0.600, 2.70, 1.70),
 ('A02','Agua purificada sin gas 2 L', 'Agua',   2.000, 6.50, 4.30);

INSERT INTO camara (nombre, ubicacion, temp_min, temp_max)
SELECT 'Cámara ' || n, 'Planta El Alto — carretera a Viacha',
       CASE WHEN n <= 6 THEN -22 ELSE 2 END, CASE WHEN n <= 6 THEN -18 ELSE 6 END
FROM generate_series(1, 8) n;

-- ---------- personas ----------
CREATE TEMP TABLE nom AS SELECT
 ARRAY['Juan','María','Carlos','Ana','Luis','Rosa','José','Carmen','Pedro','Elena','Miguel','Sonia','Jorge','Lidia','Víctor',
       'Nelly','Freddy','Gladys','Rubén','Martha','Wilson','Julia','Edgar','Silvia','René','Norma','Iván','Beatriz','Óscar','Teresa'] AS n,
 ARRAY['Mamani','Quispe','Condori','Flores','Choque','Apaza','Huanca','Ticona','Limachi','Calle','Nina','Poma','Callisaya',
       'Laura','Gutiérrez','Vargas','Rojas','Fernández','Chambi','Alanoca'] AS a;

-- 30 vendedores repartidos según el tamaño de cada zona, 6 inspectores, 2 administradores
INSERT INTO usuario (nombre, rol, zona_id)
SELECT n[1 + (i * 7) % 30] || ' ' || a[1 + (i * 3) % 20] || ' ' || a[1 + (i * 11) % 20],
       CASE WHEN i <= 30 THEN 'vendedor' WHEN i <= 36 THEN 'inspector' ELSE 'admin' END,
       CASE WHEN i <= 8 THEN 1 WHEN i <= 15 THEN 2 WHEN i <= 20 THEN 3 WHEN i <= 24 THEN 4 WHEN i <= 27 THEN 5 WHEN i <= 30 THEN 6 END
FROM generate_series(1, 38) i, nom;

-- ---------- puntos de venta: el censo por zona (2.381) ----------
INSERT INTO punto_venta (nombre, canal, zona_id, direccion)
SELECT CASE c WHEN 'supermercado' THEN 'Supermercado ' WHEN 'kiosco' THEN 'Kiosco ' ELSE 'Tienda ' END
         || (ARRAY['Doña Rosa','San Antonio','La Esquina','El Progreso','Copacabana','Don Lucho','Las Delicias','16 de Julio',
                   'Illimani','El Ceibo','Señor de Mayo','La Económica','Doña Juana','Villa Adela','Los Andes','El Kantutani'])[1 + (i * 5 + z) % 16]
         || ' ' || i,
       c, z,
       (ARRAY['Av. Juan Pablo II','Av. 6 de Marzo','Calle Sagárnaga','Av. Buenos Aires','Av. Busch','Calle 21 de Calacoto',
              'Av. Bolivia','Calle Murillo','Av. Tiahuanacu','Calle Illampu'])[1 + (i * 3 + z) % 10] || ' Nº ' || (100 + (i * 37) % 2900)
FROM (SELECT z, i, CASE WHEN r < 0.03 THEN 'supermercado' WHEN r < 0.10 THEN 'kiosco' ELSE 'tienda de barrio' END c
      FROM (VALUES (1,615),(2,548),(3,402),(4,296),(5,268),(6,252)) censo(z, total),
           LATERAL (SELECT i, random() r FROM generate_series(1, total) i) g) s
ORDER BY z, i;

-- ---------- parámetros de la simulación ----------
-- peso: participación en líneas de venta · umin/umax: unidades por línea · paso: días entre lotes
CREATE TEMP TABLE pp (codigo text, peso float8, umin int, umax int, paso int);
INSERT INTO pp VALUES
 ('H01',30,12,60,2), ('H02',14,12,48,2), ('H03',8,6,36,2), ('H04',0.3,1,3,2), ('H05',3,6,24,2), ('H06',12,12,60,2),
 ('Y01',2,6,18,4), ('Y02',1.5,6,18,4), ('Y03',10,12,36,4), ('A01',8,12,48,7), ('A02',3,6,18,7);

-- estacionalidad del helado por mes calendario (pico en verano, piso en invierno)
CREATE TEMP TABLE est (mes int, f float8);
INSERT INTO est VALUES (1,1.00),(2,0.94),(3,0.83),(4,0.64),(5,0.50),(6,0.40),(7,0.36),(8,0.39),(9,0.66),(10,0.75),(11,0.85),(12,0.97);

-- ---------- lotes ----------
INSERT INTO lote (codigo, producto_id, camara_id, fecha_ingreso, fecha_vencimiento, cantidad, costo_unitario, creado_en)
SELECT 'L' || p.codigo || '-' || to_char(d, 'YYMMDD'), p.id,
       CASE p.linea WHEN 'Helados' THEN 1 + (p.id + k) % 6 WHEN 'Yogurt' THEN 7 + (p.id + k) % 2 END,
       d::date,
       d::date + CASE p.linea WHEN 'Yogurt' THEN 30 ELSE 365 END,
       CASE p.codigo WHEN 'H04' THEN 100 + floor(random() * 200) ELSE 2000 + floor(random() * 6000) END,
       round((p.costo * (0.95 + random() * 0.10))::numeric, 4),
       d + interval '6 hours'
FROM producto p JOIN pp USING (codigo),
     LATERAL (SELECT d, row_number() OVER () k
              FROM generate_series(current_date - 372, current_date - 1, pp.paso * interval '1 day') d) g
ORDER BY d, p.id;

-- ---------- ventas: una fila por visita, de lunes a sábado ----------
CREATE TEMP TABLE pv_idx AS
SELECT id, zona_id, row_number() OVER (PARTITION BY zona_id ORDER BY id) n, count(*) OVER (PARTITION BY zona_id) total
FROM punto_venta;

CREATE TEMP TABLE vis AS
SELECT d::date dia, u.id vendedor_id, u.zona_id, random() r_pv, random() r_ok, random() r_hora
FROM generate_series(current_date - 365, current_date - 1, interval '1 day') d
     CROSS JOIN usuario u CROSS JOIN generate_series(1, 4) k
WHERE u.rol = 'vendedor' AND extract(isodow FROM d) < 7 AND random() < 0.95;

CREATE FUNCTION pg_temp.elegir(vals text[], pesos float8[]) RETURNS text LANGUAGE plpgsql VOLATILE AS $$
DECLARE r float8 := random() * (SELECT sum(x) FROM unnest(pesos) x);
BEGIN
  FOR i IN 1 .. array_length(vals, 1) LOOP
    r := r - pesos[i];
    IF r <= 0 THEN RETURN vals[i]; END IF;
  END LOOP;
  RETURN vals[array_length(vals, 1)];
END $$;

-- la conversión de visita en venta sube de 58 % a 73 % a lo largo del año
INSERT INTO venta (fecha, vendedor_id, punto_venta_id, realizada, motivo_no_venta, creado_en)
SELECT ts, vendedor_id, pv_id, ok,
       CASE WHEN NOT ok THEN pg_temp.elegir(
            ARRAY['Aún tiene stock','Congelador averiado','Producto de competidor en consignación','Falta de caja del tendero','Punto de venta cerrado'],
            ARRAY[38, 14, 12, 26, 10]) END,
       ts
FROM (SELECT v.dia + interval '8 hours' + v.r_hora * interval '10 hours' ts, v.vendedor_id, p.id pv_id,
             v.r_ok < 0.58 + 0.15 * (v.dia - (current_date - 365)) / 365.0 ok
      FROM vis v JOIN pv_idx p ON p.zona_id = v.zona_id AND p.n = 1 + floor(v.r_pv * p.total)::int) s
ORDER BY ts;

-- ---------- detalle: 1 a 3 líneas por venta, mezcla de producto según la época ----------
-- t = avance del año (0..1): el yogurt crece con t; helado y agua siguen la estación.
CREATE TEMP TABLE peso AS
SELECT e.mes, p.id producto_id, p.linea, pp.peso w, e.f FROM est e CROSS JOIN producto p JOIN pp USING (codigo);

CREATE FUNCTION pg_temp.elegir_producto(m int, t float8) RETURNS int LANGUAGE sql VOLATILE AS $$
  SELECT producto_id FROM peso WHERE mes = m
  ORDER BY -ln(1 - random()) / (w * CASE linea WHEN 'Yogurt' THEN 0.55 + 0.45 * t WHEN 'Agua' THEN 0.6 + 0.4 * f ELSE f END)
  LIMIT 1
$$;

CREATE TEMP TABLE lin AS
SELECT v.id venta_id, v.fecha, random() r_cant,
       pg_temp.elegir_producto(extract(month FROM v.fecha)::int, (v.fecha::date - (current_date - 365)) / 365.0) producto_id
FROM venta v CROSS JOIN generate_series(1, 3) k
WHERE v.realizada AND (k = 1 OR random() < 0.72);

INSERT INTO venta_detalle (venta_id, lote_id, producto_id, cantidad, precio_unitario, creado_en)
SELECT l.venta_id, lt.id, l.producto_id,
       greatest(1, round((pp.umin + l.r_cant * (pp.umax - pp.umin))
                         * CASE WHEN p.linea = 'Yogurt' THEN 1 ELSE 0.6 + 0.6 * e.f END))::int,
       p.precio, l.fecha
FROM lin l
JOIN producto p ON p.id = l.producto_id
JOIN pp USING (codigo)
JOIN est e ON e.mes = extract(month FROM l.fecha)
CROSS JOIN LATERAL (SELECT id FROM lote WHERE producto_id = l.producto_id AND fecha_ingreso <= l.fecha::date
                    ORDER BY fecha_ingreso DESC LIMIT 1) lt
ORDER BY l.fecha;

UPDATE venta v SET total = s.t
FROM (SELECT venta_id, sum(cantidad * precio_unitario) t FROM venta_detalle GROUP BY 1) s
WHERE s.venta_id = v.id;

-- ---------- inspecciones: dos rondas diarias por cámara ----------
-- 5 % de lecturas fuera de rango; la cámara 3 falla seis semanas (35 %).
INSERT INTO inspeccion (fecha, camara_id, inspector_id, temperatura, observacion, creado_en)
SELECT ts, camara_id, inspector_id, temp,
       CASE WHEN temp > temp_max THEN 'Temperatura sobre el rango: se revisa el equipo' END, ts
FROM (SELECT d + CASE ronda WHEN 1 THEN interval '7 hours' ELSE interval '16 hours' END + random() * interval '90 minutes' ts,
             c.id camara_id, c.temp_max,
             (SELECT id FROM usuario WHERE rol = 'inspector' ORDER BY id OFFSET (c.id + ronda + extract(doy FROM d)::int) % 6 LIMIT 1) inspector_id,
             round(((c.temp_min + c.temp_max) / 2
                    + CASE WHEN random() < CASE WHEN c.id = 3 AND d BETWEEN current_date - 260 AND current_date - 218 THEN 0.35 ELSE 0.05 END
                           THEN 3 + random() * 8 ELSE (random() - 0.5) * 3 END)::numeric, 1) temp
      FROM generate_series(current_date - 365, current_date - 1, interval '1 day') d
           CROSS JOIN camara c CROSS JOIN generate_series(1, 2) ronda) s
ORDER BY ts;

-- ---------- merma: lo que el inspector da de baja en cada ronda ----------
INSERT INTO merma (inspeccion_id, lote_id, cantidad, causa, creado_en)
SELECT i.id, lt.id,
       -- se sortea el valor perdido (Bs) y se convierte a unidades: un bidón no se pierde de a cientos
       greatest(1, round((CASE WHEN i.fuera THEN 40 + random() * 200 ELSE 8 + random() * 62 END) / lt.costo_unitario))::int,
       CASE WHEN i.fuera THEN pg_temp.elegir(ARRAY['Falla de equipo','Corte de energía'], ARRAY[55, 45])
            ELSE pg_temp.elegir(ARRAY['Vencimiento','Manipulación','Rotura de cadena en tránsito'], ARRAY[45, 35, 20]) END,
       i.fecha
FROM (SELECT i.*, i.temperatura > c.temp_max fuera FROM inspeccion i JOIN camara c ON c.id = i.camara_id) i
     CROSS JOIN generate_series(1, 2) k
     CROSS JOIN LATERAL (SELECT id, costo_unitario FROM lote
                         WHERE camara_id = i.camara_id AND fecha_ingreso BETWEEN i.fecha::date - 40 AND i.fecha::date
                         ORDER BY random() + k * 0 LIMIT 1) lt
WHERE random() < CASE WHEN i.fuera THEN 0.9 ELSE 0.22 END
ORDER BY i.fecha;

-- ---------- resumen ----------
SELECT 'zona' tabla, count(*) filas FROM zona UNION ALL SELECT 'usuario', count(*) FROM usuario
UNION ALL SELECT 'punto_venta', count(*) FROM punto_venta UNION ALL SELECT 'producto', count(*) FROM producto
UNION ALL SELECT 'camara', count(*) FROM camara UNION ALL SELECT 'lote', count(*) FROM lote
UNION ALL SELECT 'venta', count(*) FROM venta UNION ALL SELECT 'venta_detalle', count(*) FROM venta_detalle
UNION ALL SELECT 'inspeccion', count(*) FROM inspeccion UNION ALL SELECT 'merma', count(*) FROM merma;
