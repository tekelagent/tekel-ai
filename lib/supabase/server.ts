/**
 * Cliente de Supabase para uso EXCLUSIVAMENTE server-side.
 *
 * Usa la service role key, que salta RLS. Nunca debe llegar al navegador:
 * por eso este módulo no lleva "use client" y solo se importa desde route
 * handlers y server components.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cliente: SupabaseClient | null = null;

export function supabaseServer(): SupabaseClient {
  if (cliente) return cliente;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno del servidor.",
    );
  }

  cliente = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cliente;
}
