/**
 * Clasificación y filtrado de los adjuntos de un contrato de SECOP II.
 *
 * Un contrato publica de todo: el pliego y los estudios previos (donde vive el
 * indicio de corrupción) conviven con pólizas, RUT, cédulas y planillas de
 * seguridad social. Descargar y mandar todo al LLM sería caro y ruidoso, así
 * que aquí se decide qué vale la pena leer.
 *
 * El criterio es de auditoría, no de completitud: se prioriza el documento que
 * puede sostener un hallazgo (§3 de METODOLOGIA) y se descarta el trámite.
 */

/** Tipos que acepta `documents.tipo` en la base. */
export type TipoDocumento = "pliego" | "contrato" | "otrosi" | "estudios" | "anexo" | "otro";

export type DocumentoCrudo = {
  nombre: string;
  descripcion?: string | null;
  extension?: string | null;
  /** Bytes, tal como los publica el dataset. */
  tamano?: number | null;
};

export type DocumentoClasificado = {
  tipo: TipoDocumento;
  /** Orden de lectura: 1 es lo primero que debe ver el analista. */
  prioridad: number;
  relevante: boolean;
  /** Por qué se incluyó o se descartó, para que la decisión sea auditable. */
  motivo: string;
};

/**
 * El nombre de archivo en SECOP es texto libre escrito por cada entidad: llega
 * con tildes, mayúsculas, guiones y números de radicado. Se normaliza antes de
 * comparar para que "PLIEGO DEFINITIVO" y "pliego_definitivo" caigan igual.
 */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Reglas en orden: la primera que coincide gana. El orden importa porque los
 * nombres se solapan ("otrosí al contrato" es otrosí, no contrato).
 */
const REGLAS: Array<{ tipo: TipoDocumento; prioridad: number; re: RegExp }> = [
  // Un otrosí modifica valor o plazo: es donde aparecen las adiciones sucesivas.
  { tipo: "otrosi", prioridad: 2, re: /\botro ?si\b|\bmodificatori[oa]\b|\bmodificaci?on\b|\badici?on\b|\bprorroga\b|\bsuspension\b/ },
  // El pliego define quién puede ganar: el "pliego sastre" se detecta aquí.
  // Ojo con el plural y con el proyecto de pliego: la adenda que estrecha un
  // requisito a última hora suele ser la pieza que delata el direccionamiento.
  { tipo: "pliego", prioridad: 1, re: /\bpliegos?\b|\bpcd\b|\badendas?\b|terminos de referencia|\btdr\b|\binvitacion\b|aviso de convocatoria|condiciones (especiales|contractuales)/ },
  // Los estudios previos justifican la necesidad y el precio.
  { tipo: "estudios", prioridad: 1, re: /estudios? previos?|analisis del sector|estudio de (mercado|conveniencia)|justificacion|\bnecesidad\b/ },
  { tipo: "contrato", prioridad: 2, re: /\bcontrato\b|\bminuta\b|pccntr|acta de (inicio|liquidacion)|adjudicacion|carta (de )?aceptacion|aceptacion (de la )?oferta/ },
  // La oferta económica es la contraparte del presupuesto oficial: sin ella no
  // se puede mirar un sobrecosto.
  { tipo: "anexo", prioridad: 3, re: /\banexos?\b|\bformato\b|\bapendice\b|matriz de riesgo|ficha tecnica|\bevaluacion\b|informe de (evaluacion|supervision)|(oferta|ofrecimiento|propuesta) economic[oa]|cuadro comparativo/ },
];

/**
 * Trámite administrativo: existe en todo contrato, no distingue al sospechoso
 * del limpio y suele ser el 70% de los adjuntos.
 */
const RUIDO =
  /\bpoliza\b|\bgarantia\b|\brut\b|\bcedula\b|camara de comercio|antecedentes (fiscales|disciplinarios|judiciales)|seguridad social|\bparafiscal|\bplanilla\b|hoja de vida|\bfactura\b|cuenta de cobro|\bpaz y salvo\b|certificado (bancario|de pago)|\bcdp\b|\brp\b|registro presupuestal/;

/** Extensiones que un LLM puede leer como texto. El resto se cataloga pero no se analiza. */
const LEGIBLES = new Set(["pdf", "doc", "docx", "txt", "rtf"]);

/** Techo de tamaño: por encima suele ser un escaneo de cientos de páginas. */
const MAX_BYTES = 40 * 1024 * 1024;

export function clasificar(doc: DocumentoCrudo): DocumentoClasificado {
  const texto = normalizar(`${doc.nombre} ${doc.descripcion ?? ""}`);
  const ext = (doc.extension ?? doc.nombre.split(".").pop() ?? "").toLowerCase();

  let tipo: TipoDocumento = "otro";
  let prioridad = 4;
  for (const r of REGLAS) {
    if (r.re.test(texto)) {
      tipo = r.tipo;
      prioridad = r.prioridad;
      break;
    }
  }

  // El descarte se evalúa después de clasificar: un "otrosí" que además diga
  // "póliza" sigue siendo un otrosí y sigue importando.
  if (tipo === "otro" && RUIDO.test(texto)) {
    return { tipo, prioridad: 9, relevante: false, motivo: "trámite administrativo" };
  }
  if (!LEGIBLES.has(ext)) {
    return { tipo, prioridad: 9, relevante: false, motivo: `formato no analizable (${ext || "sin extensión"})` };
  }
  if (doc.tamano != null && doc.tamano > MAX_BYTES) {
    return { tipo, prioridad: 9, relevante: false, motivo: `pesa ${Math.round(doc.tamano / 1e6)} MB` };
  }
  if (tipo === "otro") {
    return { tipo, prioridad: 8, relevante: false, motivo: "no se reconoce como pieza del expediente" };
  }

  return { tipo, prioridad, relevante: true, motivo: `${tipo} identificado por nombre` };
}

/**
 * Ordena y recorta lo que se va a descargar de un contrato.
 * Se queda con los de mayor valor probatorio primero y, dentro del mismo tipo,
 * con el más pesado: entre dos "pliego", el largo es el definitivo y el corto
 * suele ser el aviso de convocatoria.
 */
export function seleccionar<T extends DocumentoCrudo>(
  docs: T[],
  max = 6,
): Array<T & { clasificacion: DocumentoClasificado }> {
  return docs
    .map((d) => ({ ...d, clasificacion: clasificar(d) }))
    .filter((d) => d.clasificacion.relevante)
    .sort(
      (a, b) =>
        a.clasificacion.prioridad - b.clasificacion.prioridad ||
        (b.tamano ?? 0) - (a.tamano ?? 0),
    )
    .slice(0, max);
}
