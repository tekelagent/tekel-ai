/**
 * Configuración NO secreta.
 *
 * Las llaves de API viven en Infisical y se inyectan como variables de entorno
 * (`infisical run --env=dev -- <comando>`). Este archivo cubre lo contrario:
 * valores que eligen comportamiento, no credenciales. Por eso se versionan con
 * defaults sensatos en `env.example` y NO se suben al vault.
 */
import { z } from "zod";

const schema = z.object({
  TEKEL_LLM_BULK_MODEL: z.string().min(1).default("deepseek/deepseek-v3.2"),
  TEKEL_LLM_DEEP_MODEL: z.string().min(1).optional(),
  FORENSIC_PROVIDER: z.enum(["croma", "mock"]).default("croma"),
});

// Una variable vacía en .env cuenta como ausente: así el default aplica en vez
// de fallar la validación con un string vacío.
const parsed = schema.safeParse({
  TEKEL_LLM_BULK_MODEL: process.env.TEKEL_LLM_BULK_MODEL || undefined,
  TEKEL_LLM_DEEP_MODEL: process.env.TEKEL_LLM_DEEP_MODEL || undefined,
  FORENSIC_PROVIDER: process.env.FORENSIC_PROVIDER || undefined,
});

if (!parsed.success) {
  const detail = parsed.error.issues
    .map((i) => `  ${i.path.join(".") || "(raíz)"}: ${i.message}`)
    .join("\n");
  throw new Error(`Configuración inválida en variables de entorno:\n${detail}`);
}

const env = parsed.data;

export const config = {
  llm: {
    /** OpenRouter expone una API compatible con OpenAI. */
    baseUrl: "https://openrouter.ai/api/v1",
    /** Capa B — batch masivo y barato. */
    bulkModel: env.TEKEL_LLM_BULK_MODEL,
    /** Capa C — razonamiento profundo. Sin default: se fija tras el bake-off. */
    deepModel: env.TEKEL_LLM_DEEP_MODEL ?? null,
  },
  forensic: {
    /** `croma` pega contra la API real; `mock` usa fixtures etiquetadas. */
    provider: env.FORENSIC_PROVIDER,
  },
} as const;

export type Config = typeof config;

/**
 * Modelo profundo o error explícito. La Capa C no debe degradarse en silencio
 * a un modelo barato: si falta el slug, es un fallo de configuración.
 */
export function requireDeepModel(): string {
  if (!config.llm.deepModel) {
    throw new Error(
      "TEKEL_LLM_DEEP_MODEL no está definido. Copia el slug exacto del modelo " +
        "desde su página en openrouter.ai.",
    );
  }
  return config.llm.deepModel;
}
