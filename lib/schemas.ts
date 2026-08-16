/**
 * Schemas zod compartidos. Toda salida de LLM se valida contra uno de estos
 * antes de tocar la base de datos.
 */
import { z } from "zod";

/**
 * Salida de la Capa B (enriquecimiento por lote).
 *
 * `resumen_riesgo` va directo a la UI, así que el schema acota su longitud:
 * dos líneas, no un párrafo. `objeto_difuso` alimenta el patrón OBJETO_DIFUSO,
 * y su motivo es la evidencia que lo sustenta.
 */
export const EnrichmentSchema = z.object({
  /** Dos líneas en español explicando el riesgo del contrato. */
  resumen_riesgo: z.string().min(20).max(400),
  /** true si el objeto contractual es vago o genérico para su cuantía. */
  objeto_difuso: z.boolean(),
  /** Por qué el objeto es difuso. null cuando `objeto_difuso` es false. */
  objeto_difuso_motivo: z.string().max(300).nullable(),
});

export type Enrichment = z.infer<typeof EnrichmentSchema>;
