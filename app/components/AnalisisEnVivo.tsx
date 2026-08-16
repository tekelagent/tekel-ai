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
        className="w-full bg-brand-gradient rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              corriendo ? "animate-pulse bg-primary" : estado.terminado ? "bg-ok" : "bg-warn"
            }`}
          />
          <span className="text-foreground/85">
            {corriendo
              ? (ETIQUETA_PASO[estado.stage ?? ""] ?? "Procesando") + "…"
              : estado.status === "needs_upload"
                ? "Esperando el documento"
                : estado.status === "done"
                  ? "Análisis completo"
                  : estado.status}
          </span>
          {estado.cost_usd > 0 && (
            <span className="ml-auto font-mono text-muted-foreground">
              ${estado.cost_usd.toFixed(4)} USD
            </span>
          )}
        </div>
      )}

      {/* Consola sobre fondo oscuro a propósito: es un log, y así se lee como
          lo que es. Los colores van explícitos porque aquí los tokens del tema
          claro darían texto oscuro sobre oscuro. */}
      <div className="max-h-72 overflow-y-auto rounded-xl border border-hairline bg-[#0f172a] p-3">
        <div className="space-y-1 font-mono text-[11px] leading-relaxed">
          {(estado?.log ?? []).map((l, i) => (
            <div key={i} className="log-line-in flex gap-2">
              <span className="shrink-0 text-slate-500">{l.ts.slice(11, 19)}</span>
              <span className="text-slate-200">{l.msg}</span>
            </div>
          ))}
          <div ref={finRef} />
        </div>
      </div>

      {estado?.status === "needs_upload" && (
        <Dropzone onArchivo={subirPdf} subiendo={subiendo} />
      )}

      {error && (
        <p className="rounded-lg border border-crit/30 bg-crit-soft p-3 text-xs text-crit">
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
        sobre ? "border-primary bg-accent" : "border-input bg-muted/40 hover:border-primary/60"
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
        <p className="text-sm text-foreground/85">Subiendo y leyendo el documento…</p>
      ) : (
        <>
          <p className="text-sm font-medium text-foreground">Arrastra el pliego en PDF</p>
          <p className="mt-1 text-xs text-muted-foreground">
            SECOP no permite descargarlo automáticamente. Súbelo y el análisis sigue solo.
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground/70">Máx. 25 MB · 80 páginas</p>
        </>
      )}
    </div>
  );
}
