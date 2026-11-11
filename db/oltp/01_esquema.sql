-- ============================================================
-- Helados Panda · base TRANSACCIONAL (panda_oltp)
-- Modelo relacional de toda la vida: dos módulos, ventas e inspección
-- de cámaras. Sin reglas de negocio: solo lo necesario para registrar.
--
-- Todas las tablas de movimiento son de solo-inserción y llevan un id
-- creciente: esa es la marca de agua que usa el ETL para leer solo lo nuevo.
-- ============================================================

CREATE TABLE zona (
    id         serial PRIMARY KEY,
    nombre     text NOT NULL UNIQUE,
    municipio  text NOT NULL
);

CREATE TABLE usuario (
    id       serial PRIMARY KEY,
    nombre   text NOT NULL,
    rol      text NOT NULL,              -- vendedor | inspector | admin
    zona_id  int REFERENCES zona,        -- zona de reparto del vendedor
    activo   boolean NOT NULL DEFAULT true
);

CREATE TABLE punto_venta (
    id         serial PRIMARY KEY,
    nombre     text NOT NULL,
    canal      text NOT NULL,            -- tienda de barrio | kiosco | supermercado
    zona_id    int NOT NULL REFERENCES zona,
    direccion  text
);

CREATE TABLE producto (
    id             serial PRIMARY KEY,
    codigo         text NOT NULL UNIQUE,
    nombre         text NOT NULL,
    linea          text NOT NULL,        -- Helados | Yogurt | Agua
    litros_unidad  numeric(8,3) NOT NULL,
    precio         numeric(10,2) NOT NULL,
    costo          numeric(10,4) NOT NULL
);

CREATE TABLE camara (
    id         serial PRIMARY KEY,
    nombre     text NOT NULL,
    ubicacion  text NOT NULL,
    temp_min   numeric(5,1) NOT NULL,
    temp_max   numeric(5,1) NOT NULL
);

CREATE TABLE lote (
    id                 bigserial PRIMARY KEY,
    codigo             text NOT NULL UNIQUE,
    producto_id        int NOT NULL REFERENCES producto,
    camara_id          int REFERENCES camara,    -- nulo: no requiere frío
    fecha_ingreso      date NOT NULL DEFAULT current_date,
    fecha_vencimiento  date,
    cantidad           int NOT NULL,
    costo_unitario     numeric(10,4) NOT NULL,
    creado_en          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON lote (producto_id, fecha_ingreso DESC);

-- Una fila por visita del repartidor: con o sin venta.
CREATE TABLE venta (
    id                bigserial PRIMARY KEY,
    fecha             timestamptz NOT NULL DEFAULT now(),
    vendedor_id       int NOT NULL REFERENCES usuario,
    punto_venta_id    int NOT NULL REFERENCES punto_venta,
    realizada         boolean NOT NULL,
    motivo_no_venta   text,
    total             numeric(12,2) NOT NULL DEFAULT 0,
    creado_en         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE venta_detalle (
    id               bigserial PRIMARY KEY,
    venta_id         bigint NOT NULL REFERENCES venta,
    lote_id          bigint NOT NULL REFERENCES lote,
    producto_id      int NOT NULL REFERENCES producto,
    cantidad         int NOT NULL,
    precio_unitario  numeric(10,2) NOT NULL,
    creado_en        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON venta_detalle (venta_id);

CREATE TABLE inspeccion (
    id            bigserial PRIMARY KEY,
    fecha         timestamptz NOT NULL DEFAULT now(),
    camara_id     int NOT NULL REFERENCES camara,
    inspector_id  int NOT NULL REFERENCES usuario,
    temperatura   numeric(5,1) NOT NULL,
    observacion   text,
    creado_en     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE merma (
    id             bigserial PRIMARY KEY,
    inspeccion_id  bigint NOT NULL REFERENCES inspeccion,
    lote_id        bigint NOT NULL REFERENCES lote,
    cantidad       int NOT NULL,
    causa          text NOT NULL,
    creado_en      timestamptz NOT NULL DEFAULT now()
);
