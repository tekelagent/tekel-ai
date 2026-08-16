/**
 * LLMProvider — adaptador de modelos de lenguaje.
 *
 * La implementación concreta es OpenRouter, que expone una API compatible con
 * OpenAI. Cambiar de modelo es cambiar una variable de entorno; cambiar de
 * proveedor es escribir otra implementación de esta misma interfaz.
 *
 * Toda salida se valida con zod. Si el modelo devuelve algo que no encaja en el
 * schema, se reintenta UNA vez incluyendo el error de validación en el prompt;
 * si vuelve a fallar, se registra y se omite ese ítem. Nunca se deja pasar una
 * respuesta sin validar.
 */
import type { z } from "zod";
import { config } from "../config";

export type LLMUsage = {
  promptTokens: number;
  completionTokens: number;
  /** Costo en USD reportado por OpenRouter, cuando lo informa. */
  costUsd: number | null;
};

export type LLMResult<T> = {
  data: T;
  usage: LLMUsage;
  /** true si hizo falta el reintento con el error de validación. */
  retried: boolean;
};

export type StructuredRequest<T> = {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  /** Nombre del schema, que va en el prompt para orientar al modelo. */
  schemaName: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  /** Pide una respuesta que cumpla el schema. Lanza si no lo logra tras el reintento. */
  structured<T>(req: StructuredRequest<T>): Promise<LLMResult<T>>;
}

/** Error que sobrevive al reintento: la respuesta nunca encajó en el schema. */
export class LLMValidationError extends Error {
  constructor(
    message: string,
    readonly raw: string,
  ) {
    super(message);
    this.name = "LLMValidationError";
  }
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const SIN_CLAVE =
  "Falta OPENROUTER_API_KEY. Lanza el script con: infisical run --env=dev -- <comando>";

/**
 * Extrae el primer objeto JSON de una respuesta. Los modelos suelen envolver el
 * JSON en ```json ... ``` o precederlo de una frase, aunque se les pida lo
 * contrario.
 */
function extractJson(text: string): string {
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = (fence ? fence[1] : text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return candidate;
  return candidate.slice(start, end + 1);
}

/** Mensaje de error de zod, legible y compacto, para meterlo en el reprompt. */
function zodIssues(err: z.ZodError): string {
  return err.issues
    .map((i) => `- ${i.path.join(".") || "(raíz)"}: ${i.message}`)
    .join("\n");
}

export class OpenRouterProvider implements LLMProvider {
  readonly name = "openrouter";
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(opts: { apiKey?: string; model?: string; baseUrl?: string } = {}) {
    const apiKey = opts.apiKey ?? process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error(SIN_CLAVE);
    this.apiKey = apiKey;
    this.model = opts.model ?? config.llm.bulkModel;
    this.baseUrl = opts.baseUrl ?? config.llm.baseUrl;
  }

  async structured<T>(req: StructuredRequest<T>): Promise<LLMResult<T>> {
    const model = req.model ?? this.model;
    const mensajes: ChatMessage[] = [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ];

    let usoAcumulado: LLMUsage = { promptTokens: 0, completionTokens: 0, costUsd: 0 };
    let ultimoCrudo = "";

    for (let intento = 1; intento <= 2; intento++) {
      const { content, usage } = await this.chat(mensajes, model, req);
      ultimoCrudo = content;
      usoAcumulado = {
        promptTokens: usoAcumulado.promptTokens + usage.promptTokens,
        completionTokens: usoAcumulado.completionTokens + usage.completionTokens,
        costUsd:
          usage.costUsd === null
            ? usoAcumulado.costUsd
            : (usoAcumulado.costUsd ?? 0) + usage.costUsd,
      };

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(extractJson(content));
      } catch {
        if (intento === 2) {
          throw new LLMValidationError("La respuesta no es JSON válido", content);
        }
        mensajes.push({ role: "assistant", content });
        mensajes.push({
          role: "user",
          content:
            "Esa respuesta no es JSON válido. Devuelve ÚNICAMENTE el objeto JSON, " +
            "sin texto alrededor y sin bloques de código.",
        });
        continue;
      }

      const result = req.schema.safeParse(parsedJson);
      if (result.success) {
        return { data: result.data, usage: usoAcumulado, retried: intento > 1 };
      }

      if (intento === 2) {
        throw new LLMValidationError(
          `La respuesta no cumple el schema ${req.schemaName}:\n${zodIssues(result.error)}`,
          content,
        );
      }

      // Reintento único, con el error de validación dentro del prompt.
      mensajes.push({ role: "assistant", content });
      mensajes.push({
        role: "user",
        content:
          `Tu respuesta no cumple el schema ${req.schemaName}. Errores:\n` +
          `${zodIssues(result.error)}\n\n` +
          `Corrige y devuelve ÚNICAMENTE el objeto JSON completo.`,
      });
    }

    throw new LLMValidationError("Reintento agotado", ultimoCrudo);
  }

  private async chat<T>(
    messages: ChatMessage[],
    model: string,
    req: StructuredRequest<T>,
  ): Promise<{ content: string; usage: LLMUsage }> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        // OpenRouter usa estas cabeceras para atribuir el tráfico.
        "HTTP-Referer": "https://github.com/tekelagent/tekel-ai",
        "X-Title": "Tekel Agent",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: req.temperature ?? 0.2,
        max_tokens: req.maxTokens ?? 700,
        response_format: { type: "json_object" },
        usage: { include: true },
      }),
    });

    if (!res.ok) {
      const cuerpo = await res.text();
      throw new Error(`OpenRouter ${res.status}: ${cuerpo.slice(0, 400)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
    };

    const content = json.choices?.[0]?.message?.content ?? "";
    if (!content) throw new Error("OpenRouter devolvió una respuesta vacía");

    return {
      content,
      usage: {
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
        costUsd: typeof json.usage?.cost === "number" ? json.usage.cost : null,
      },
    };
  }
}

/** Provider por defecto: OpenRouter con el modelo de la Capa B. */
export function createLLMProvider(): LLMProvider {
  return new OpenRouterProvider();
}
