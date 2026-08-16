"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type LineaLog = { ts: string; msg: string };
export type EstadoAnalisis = {
  status: string;
  stage: string | null;
  log: LineaLog[];
  cost_usd: number;
  terminado: boolean;
  error?: string;
};

const ETIQUETA_PASO: Record<string, string> = {
  forense: "Verificación forense",
  docs: "Búsqueda de documentos",
  pliego: "Análisis del pliego",
};

/**
 * Bucle de análisis en vivo: llama a /advance cada 1,8 s y pinta cada línea del
 * log al llegar. No hay websockets ni colas; el bucle ES la experiencia.
 */
export function AnalisisEnVivo({
  idContrato,
  autoIniciar = false,
  onTerminado,
}: {
  idContrato: string;
  autoIniciar?: boolean;
  onTerminado?: () => void;
}) {
  const [estado, setEstado] = useState<EstadoAnalisis | null>(null);
  const [corriendo, setCorriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  const iniciar = useCallback(async () => {
    setCorriendo(true);
    setError(null);
    try {
      const r = await fetch(`/api/analysis/${encodeURIComponent(idContrato)}/start`, {
        method: "POST",
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "No se pudo iniciar el análisis");
      setEstado(j);
    } catch (e) {
      setError((e as Error).message);
      setCorriendo(false);
    }
  }, [idContrato]);

  // Bucle de avance. Se detiene en done, error o needs_upload.
  useEffect(() => {
    if (!corriendo || !estado) return;
    if (estado.terminado || estado.status === "needs_upload") {
      setCorriendo(false);
      onTerminado?.();
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/analysis/${encodeURIComponent(idContrato)}/advance`, {
          method: "POST",
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Error avanzando el análisis");
        setEstado(j);
      } catch (e) {
        setError((e as Error).message);
        setCorriendo(false);
      }
    }, 1800);
    return () => clearTimeout(t);
  }, [corriendo, estado, idContrato, onTerminado]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [estado?.log?.length]);

  useEffect(() => {
    if (autoIniciar) void iniciar();
  }, [autoIniciar, iniciar]);

  async function subirPdf(archivo: File) {
    setSubiendo(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", archivo);
      const r = await fetch(`/api/analysis/${encodeURIComponent(idContrato)}/upload`, {
        method: "POST",
        body: fd,
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "No se pudo subir el documento");
      setEstado(j);
      setCorriendo(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubiendo(false);
    }
  }

  if (!estado && !corriendo && !error) {
    return (
      <button
        onClick={iniciar}
        className="w-full rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white
                   transition hover:bg-sky-500 focus:outline-none focus-visible:ring-2
                   focus-visible:ring-sky-400"
      >
        Análisis profundo
      </button>
    );
  }

  return (
    <div className="space-y-3">
      {estado && (
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              corriendo ? "animate-pulse bg-sky-400" : estado.terminado ? "bg-emerald-400" : "bg-amber-400"
            }`}
          />
          <span className="text-slate-300">
            {corriendo
              ? (ETIQUETA_PASO[estado.stage ?? ""] ?? "Procesando") + "…"
              : estado.status === "needs_upload"
                ? "Esperando el documento"
                : estado.status === "done"
                  ? "Análisis completo"
                  : estado.status}
          </span>
          {estado.cost_usd > 0 && (
            <span className="ml-auto font-mono text-slate-500">
              ${estado.cost_usd.toFixed(4)} USD
            </span>
          )}
        </div>
      )}

      <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/60 p-3">
        <div className="space-y-1 font-mono text-[11px] leading-relaxed">
          {(estado?.log ?? []).map((l, i) => (
            <div key={i} className="flex gap-2">
              <span className="shrink-0 text-slate-600">{l.ts.slice(11, 19)}</span>
              <span className="text-slate-300">{l.msg}</span>
            </div>
          ))}
          <div ref={finRef} />
        </div>
      </div>

      {estado?.status === "needs_upload" && (
        <Dropzone onArchivo={subirPdf} subiendo={subiendo} />
      )}

      {error && (
        <p className="rounded-lg border border-rose-800 bg-rose-950/40 p-3 text-xs text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}

function Dropzone({
  onArchivo,
  subiendo,
}: {
  onArchivo: (f: File) => void;
  subiendo: boolean;
}) {
  const [sobre, setSobre] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setSobre(true);
      }}
      onDragLeave={() => setSobre(false)}
      onDrop={(e) => {
        e.preventDefault();
        setSobre(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onArchivo(f);
      }}
      onClick={() => input.current?.click()}
      className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition ${
        sobre ? "border-sky-500 bg-sky-500/10" : "border-slate-700 bg-slate-900/40 hover:border-slate-600"
      }`}
    >
      <input
        ref={input}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onArchivo(f);
        }}
      />
      {subiendo ? (
        <p className="text-sm text-slate-300">Subiendo y leyendo el documento…</p>
      ) : (
        <>
          <p className="text-sm font-medium text-slate-200">Arrastra el pliego en PDF</p>
          <p className="mt-1 text-xs text-slate-500">
            SECOP no permite descargarlo automáticamente. Súbelo y el análisis sigue solo.
          </p>
          <p className="mt-1 text-[11px] text-slate-600">Máx. 25 MB · 80 páginas</p>
        </>
      )}
    </div>
  );
}
