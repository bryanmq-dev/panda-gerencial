import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { consultar, enlaces, q, type Resultado } from "./db";

// El asistente arma la consulta a partir del ESQUEMA del almacén, no de los
// datos: recibe tablas, columnas, llaves y las etiquetas de las columnas de
// categoría (línea, canal, zona…). Nunca filas de hechos.

const Propuesta = z.object({
  nombre: z.string().describe("Nombre corto del indicador"),
  descripcion: z.string().describe("Una frase: qué mide"),
  unidad: z.string().describe("Bs, %, L, u u otra unidad breve"),
  tipo_medida: z.enum(["monetaria", "operativa", "comercial", "calidad"]),
  sentido: z.enum(["mayor", "menor"]).describe("mayor si subir es mejorar, menor si bajar es mejorar"),
  grafico: z.enum(["linea", "barra", "torta", "tabla"]),
  sql: z.string().describe("Un único SELECT de PostgreSQL sobre el esquema dw, sin punto y coma"),
});
const Salida = z.object({
  respuesta: z.string().describe("Explicación breve para el gerente, en español"),
  propuesta: Propuesta.nullable().describe("null si solo se conversa o falta información"),
});

export type PropuestaIA = z.infer<typeof Propuesta>;
export type Turno = { rol: "gerente" | "asistente"; texto: string };
export type RespuestaIA = { texto: string; crudo: string; propuesta: PropuestaIA | null; vista?: Resultado; error?: string };

let cache: { texto: string; hasta: number } | undefined;

/** Descripción del almacén para el modelo: estructura y etiquetas, sin hechos. */
async function esquema(): Promise<string> {
  if (cache && cache.hasta > Date.now()) return cache.texto;
  const cols = await q(
    `SELECT c.table_name t, c.column_name c, c.data_type d, obj_description(('dw.' || c.table_name)::regclass) nota
     FROM information_schema.columns c WHERE c.table_schema = 'dw' ORDER BY c.table_name, c.ordinal_position`,
  );
  const lineas: string[] = [];
  for (const t of [...new Set(cols.map((c) => c.t))]) {
    const propias = cols.filter((c) => c.t === t);
    lineas.push(`\ndw.${t}${propias[0].nota ? ` — ${propias[0].nota}` : ""}`);
    for (const c of propias) {
      let extra = "";
      if (c.d === "text") {
        // etiquetas de categoría: solo columnas con pocos valores distintos
        const [v] = await q(`SELECT array_agg(DISTINCT x) v FROM (SELECT "${c.c}" x FROM dw."${t}" LIMIT 50000) s WHERE x IS NOT NULL`);
        if (v.v && v.v.length <= 12) extra = ` · valores: ${v.v.map((x: string) => `'${x}'`).join(", ")}`;
      }
      lineas.push(`  ${c.c} ${c.d}${extra}`);
    }
  }
  lineas.push("\nLlaves foráneas:");
  for (const e of await enlaces()) lineas.push(`  ${e.origen}.${e.columna} → ${e.destino}`);
  cache = { texto: lineas.join("\n"), hasta: Date.now() + 10 * 60_000 };
  return cache.texto;
}

const instrucciones = (esq: string) => `Eres el analista de datos de Helados Panda (INAL Ltda., El Alto, Bolivia). \
Un gerente te describe en lenguaje natural qué quiere ver y tú armas el indicador: una consulta SQL sobre el almacén de datos \
y el gráfico que mejor lo muestra. El gerente revisa tu propuesta y decide si la guarda; nada se guarda sin su aprobación.

Trabajas solo con la estructura del almacén. No ves filas de hechos, así que no afirmes cifras ni resultados: \
describe qué calcula la consulta, no qué va a salir.

Reglas de la consulta, que el sistema verifica al ejecutarla:
- PostgreSQL, un único SELECT, sin punto y coma. Solo tablas del esquema dw, siempre con el prefijo dw.
- La primera columna es el eje y las siguientes son numéricas. Para una evolución en el tiempo, el eje es \
dw.dim_fecha.periodo (primer día del mes), agrupado y ordenado por él; así el indicador admite objetivos. \
Para comparar categorías, el eje es la etiqueta de texto.
- Usa las etiquetas de categoría exactamente como aparecen en el esquema.
- Escribe el SQL legible: una cláusula (SELECT, FROM, JOIN, WHERE, GROUP BY, ORDER BY) por línea.
- Nombra las columnas en minúsculas y sin espacios, porque se muestran en la leyenda del gráfico.

Gráfico: linea para series en el tiempo, barra para comparar categorías, torta solo para partes de un total con \
pocas categorías, tabla para listados.

En "respuesta" explica en dos o tres frases, sin jerga, qué tablas usaste y cómo las uniste. Si el pedido es ambiguo \
o el almacén no tiene el dato, dilo, pregunta lo que falta y deja "propuesta" en null.

Esquema del almacén:
${esq}`;

/** Conversa con el gerente y, si corresponde, devuelve una propuesta ya ejecutada contra el almacén. */
export async function proponer(historial: Turno[]): Promise<RespuestaIA> {
  const mensajes: Anthropic.MessageParam[] = historial.slice(-20).map((t) => ({
    role: t.rol === "gerente" ? "user" : "assistant",
    content: t.texto.slice(0, 6000),
  }));
  const cliente = new Anthropic();
  const sistema = instrucciones(await esquema());

  // Hasta tres intentos: si PostgreSQL rechaza la consulta, el modelo recibe el error y corrige.
  for (let intento = 1; ; intento++) {
    const r = await cliente.messages.parse({
      model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-5-5",
      max_tokens: 16000,
      // el esquema es lo grande y estable: se cachea y cada pregunta solo paga lo nuevo
      cache_control: { type: "ephemeral" },
      system: sistema,
      messages: mensajes,
      output_config: { effort: "medium", format: zodOutputFormat(Salida) },
    });
    const u = r.usage;   // evidencia del caché: la segunda pregunta debería leer, no reescribir, el esquema
    console.log(`asistente: entrada ${u.input_tokens} · caché escrito ${u.cache_creation_input_tokens ?? 0} · caché leído ${u.cache_read_input_tokens ?? 0} · salida ${u.output_tokens}`);
    if (r.stop_reason === "refusal" || !r.parsed_output) {
      return { texto: "El asistente no pudo responder a este pedido. Intente reformularlo.", crudo: "", propuesta: null };
    }
    const salida = r.parsed_output;
    const crudo = JSON.stringify(salida);
    if (!salida.propuesta) return { texto: salida.respuesta, crudo, propuesta: null };
    try {
      const vista = await consultar(salida.propuesta.sql, 500);
      return { texto: salida.respuesta, crudo, propuesta: salida.propuesta, vista };
    } catch (e) {
      const error = (e as Error).message;
      if (intento === 3) return { texto: salida.respuesta, crudo, propuesta: salida.propuesta, error };
      mensajes.push(
        { role: "assistant", content: crudo },
        { role: "user", content: `PostgreSQL rechazó la consulta con este error:\n${error}\nCorrígela y vuelve a proponer.` },
      );
    }
  }
}

/** Traduce los errores de la API a algo que el gerente pueda leer. */
export function mensajeDeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "La clave de la API de Anthropic no es válida. Revise ANTHROPIC_API_KEY.";
  if (e instanceof Anthropic.RateLimitError) return "Se alcanzó el límite de uso de la API. Espere un momento e intente de nuevo.";
  if (e instanceof Anthropic.APIConnectionError) return "No se pudo conectar con la API de Anthropic. Revise la conexión.";
  if (e instanceof Anthropic.APIError) return `La API respondió con un error (${e.status ?? "sin código"}): ${e.message}`;
  const m = (e as Error).message ?? String(e);
  return /api[_ ]?key|authToken|credential/i.test(m)
    ? "El asistente no está configurado: falta ANTHROPIC_API_KEY en el entorno de la aplicación gerencial."
    : `No se pudo consultar al asistente: ${m}`;
}
