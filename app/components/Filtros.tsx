"use client";

import { PATRONES } from "@/lib/ui/formato";

export type EstadoFiltros = {
  q: string;
  vigencia: string;
  prioridad: string;
  risk_level: string;
  patron: string;
  departamento: string;
  modalidad: string;
  valor_min: string;
  orden: string;
};

export const FILTROS_VACIOS: EstadoFiltros = {
  q: "",
  vigencia: "",
  prioridad: "",
  risk_level: "",
  patron: "",
  departamento: "",
  modalidad: "",
  valor_min: "",
  orden: "plata",
};

const campo =
  "w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 " +
  "placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";

function Select({
  etiqueta,
  valor,
  onChange,
  opciones,
}: {
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  opciones: Array<[string, string]>;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
        {etiqueta}
      </span>
      <select className={campo} value={valor} onChange={(e) => onChange(e.target.value)}>
        <option value="">Todos</option>
        {opciones.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Filtros({
  filtros,
  setFiltros,
  departamentos,
  modalidades,
  total,
}: {
  filtros: EstadoFiltros;
  setFiltros: (f: EstadoFiltros) => void;
  departamentos: string[];
  modalidades: string[];
  total: number;
}) {
  const set = (k: keyof EstadoFiltros) => (v: string) => setFiltros({ ...filtros, [k]: v });
  const hayFiltros = Object.entries(filtros).some(
    ([k, v]) => v && k !== "orden" && k !== "q",
  );

  return (
    <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
            Buscar
          </span>
          <input
            className={campo}
            placeholder="Entidad, contratista, objeto… o pega un CO1.PCCNTR.…"
            value={filtros.q}
            onChange={(e) => set("q")(e.target.value)}
          />
        </label>
        <p className="mt-1.5 text-xs text-slate-500">
          Si pegas un identificador que no está en el corpus, se analiza en vivo desde SECOP.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Select
          etiqueta="Prioridad"
          valor={filtros.prioridad}
          onChange={set("prioridad")}
          opciones={[
            ["P1", "P1 · Inmediato"],
            ["P2", "P2 · Esta semana"],
            ["P3", "P3 · Monitoreo"],
          ]}
        />
        <Select
          etiqueta="Modo"
          valor={filtros.vigencia}
          onChange={set("vigencia")}
          opciones={[
            ["vigente", "Vigilancia activa"],
            ["historico", "Auditoría histórica"],
          ]}
        />
        <Select
          etiqueta="Riesgo"
          valor={filtros.risk_level}
          onChange={set("risk_level")}
          opciones={[
            ["critico", "Crítico"],
            ["medio", "Medio"],
            ["bajo", "Bajo"],
          ]}
        />
        <Select
          etiqueta="Ordenar por"
          valor={filtros.orden}
          onChange={set("orden")}
          opciones={[
            ["plata", "Plata en riesgo"],
            ["score", "Score"],
            ["valor", "Valor"],
            ["fecha", "Fecha de firma"],
          ]}
        />
      </div>

      <Select
        etiqueta="Patrón detectado"
        valor={filtros.patron}
        onChange={set("patron")}
        opciones={PATRONES.map((p) => [p, p.replace(/_/g, " ")])}
      />

      <div className="grid grid-cols-2 gap-3">
        <Select
          etiqueta="Departamento"
          valor={filtros.departamento}
          onChange={set("departamento")}
          opciones={departamentos.map((d) => [d, d])}
        />
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
            Valor mínimo
          </span>
          <input
            className={campo}
            type="number"
            placeholder="COP"
            value={filtros.valor_min}
            onChange={(e) => set("valor_min")(e.target.value)}
          />
        </label>
      </div>

      <Select
        etiqueta="Modalidad"
        valor={filtros.modalidad}
        onChange={set("modalidad")}
        opciones={modalidades.map((m) => [m, m])}
      />

      <div className="flex items-center justify-between border-t border-slate-800 pt-3">
        <span className="text-sm text-slate-400">
          {total.toLocaleString("es-CO")} contratos
        </span>
        {hayFiltros && (
          <button
            onClick={() => setFiltros({ ...FILTROS_VACIOS, q: filtros.q, orden: filtros.orden })}
            className="text-xs text-sky-400 hover:text-sky-300"
          >
            Limpiar filtros
          </button>
        )}
      </div>
    </div>
  );
}
