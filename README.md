# Helados Panda — sistema transaccional y sistema gerencial

Dos aplicaciones Next.js sobre PostgreSQL, separadas a propósito:

| | Ventas e inspección | Control gerencial |
|---|---|---|
| Para qué | Registrar lo que pasa: visitas, ventas, lotes, inspección de cámaras y merma | Medir: indicadores (KPI) desde el almacén de datos y objetivos (KGI) sobre ellos |
| Base | `panda_oltp`, modelo relacional normalizado | `panda_dw`, esquema estrella + tablas de control |
| URL | http://localhost:3001 | http://localhost:3012 |
| Backend | *server actions* de Next, sin API aparte | *server actions* de Next, sin API aparte |

Las dos bases viven en un solo servidor Postgres (`localhost:5441`, usuario y clave `panda`). El almacén
lee la base transaccional por `postgres_fdw`, de solo lectura.

## Cómo se ejecuta

```bash
cd proyecto_final
docker compose up --build        # la primera vez tarda: siembra ~119 mil filas y hace la primera carga
```

Las tres piezas esperan a que el almacén esté cargado. Para empezar de cero, borrando los datos:

```bash
docker compose down -v
```

**Asistente de IA (opcional).** Copie `.env.example` a `.env` y ponga su `ANTHROPIC_API_KEY`
(el archivo no se versiona). Sin clave, el asistente lo avisa y todo lo demás funciona. El modelo se cambia con la variable
`ANTHROPIC_MODEL` (por defecto `claude-haiku-5-5`).

Sin Docker, para desarrollo: `docker compose up -d db`, y en cada carpeta `npm install && npm run dev`
(ventas en el 3001, gerencial en el 3012).

## Los datos

El seeder (`db/oltp/02_seed.sql`) genera un año de operación que termina ayer, de forma determinista:

| Tabla | Filas | | Tabla | Filas |
|---|---:|---|---|---:|
| `punto_venta` | 2.381 | | `venta` (visitas) | ≈ 35.700 |
| `lote` | ≈ 1.500 | | `venta_detalle` | ≈ 70.300 |
| `inspeccion` | ≈ 5.800 | | `merma` | ≈ 3.000 |

**Datos simulados con fines académicos.** Lo tomado de información pública es solo el contexto de la empresa:
INAL Ltda. fabrica los helados Panda en El Alto; fue fundada en 1988; en 2019 sus trabajadores pidieron
convertirla en empresa social; existe el producto "Tropical 65 ml". Los precios, costos, clientes, ventas,
temperaturas y mermas son inventados, con forma realista: estacionalidad del helado, yogurt en alza,
conversión de visita que mejora del 58 % al 73 % y una cámara que falla durante seis semanas.

Fuentes: [Los Tiempos, 2019](https://www.lostiempos.com/actualidad/economia/20190708/trabajadores-helados-panda-piden-convertirla-empresa-social),
[eju.tv, 2022](https://eju.tv/2022/12/al-menos-nueve-empresas-sociales-luchan-por-salir-adelante-frente-a-un-marco-legal-trabado/),
[tesis UMSA, 2023](https://repositorio.umsa.bo/xmlui/handle/123456789/33293),
[Open Food Facts](https://world.openfoodfacts.org/product/2000000147240/tropical-panda).

## Cómo llegan los datos al almacén (ETL)

`db/dw/02_etl.sql`. De cada tabla de movimiento se guarda el **último id cargado** (`ctl.etl_marca`); cada
corrida trae solo `id > marca`. No se comparan filas ni se recorre la historia: el costo depende de lo nuevo.

- La corrida entera es **una transacción** y lee el origen con una sola instantánea: un hecho nunca apunta a
  una dimensión que todavía no llegó, y si algo falla no queda nada a medias.
- Se programa desde la pantalla *Carga de datos* (intervalo en minutos, activar o pausar, ejecutar ahora). La
  aplicación gerencial pregunta cada 20 s y la base decide si ya toca; un candado evita corridas simultáneas.
- La pantalla muestra marcas, filas pendientes por tabla y el historial de corridas.

Límite conocido: supone un origen de **solo inserción**. Un `UPDATE` o `DELETE` en el origen no se propaga.
Si eso cambia, el paso siguiente es una columna `actualizado_en` o replicación lógica.

## KPI, KGI y versiones

Un **KPI** es una consulta SQL guardada sobre el esquema `dw`. Primera columna: el eje (un `periodo`, o una
etiqueta); siguientes: valores. Cada guardado crea una **versión nueva** (`ctl.kpi_version`), con su origen
(`sistema`, `manual` o `ia`); la consulta anterior nunca se pisa.

Un **KGI** es un objetivo sobre un KPI de serie mensual: meta, fecha de inicio, fecha de fin, tipo de medida
(monetaria, operativa, comercial o calidad). La comparación arranca en el valor que el KPI tenía en el mes de
inicio y usa solo meses cerrados (`gerencial/lib/kgi.ts`, con pruebas: `npm test`).

Cada indicador muestra de dónde sale: las tablas que su consulta toca, tomadas del plan de ejecución, y las
llaves que las enlazan.

## El asistente

En *Asistente* el gerente describe lo que quiere ver. El modelo recibe la **estructura** del almacén (tablas,
columnas, llaves y las etiquetas de las columnas de categoría), nunca filas de hechos. Devuelve un JSON
validado (nombre, descripción, unidad, tipo de medida, sentido, gráfico y SQL); el servidor ejecuta la consulta
y, si PostgreSQL la rechaza, se la devuelve al modelo para que corrija (hasta tres intentos). El gerente ve
gráfico, SQL y tablas enlazadas, puede editar, y **nada se guarda sin su aprobación**.

El esquema es lo grande y estable del pedido, así que se usa *prompt caching*; el registro del servidor
muestra `caché escrito` en la primera pregunta y `caché leído` en las siguientes.

## Seguridad del SQL escrito a mano o generado

La protección está en la base, no en revisar el texto de la consulta. Todo SQL del gerente corre con el rol
`gerente_ro`, que:

- solo puede leer el esquema `dw` (no ve `ctl`, `src` ni la base transaccional);
- trabaja en transacción de solo lectura, con tope de 8 s por consulta;
- se ejecuta como una sola sentencia con tope de filas.

Credenciales de demostración (`panda`, `gerente_ro`): cámbielas fuera de clase.

## Estructura

```
docker-compose.yml
db/        00_init.sh · oltp/ (esquema, seeder) · dw/ (esquema estrella, ETL, control y KPI de fábrica)
ventas/    Next.js — registro de visitas, lotes e inspección
gerencial/ Next.js — control de operaciones, KPI, objetivos, asistente, ETL
```
