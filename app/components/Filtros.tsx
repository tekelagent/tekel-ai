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
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground " +
  "placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/40";

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
      <span className="label-eyebrow mb-1 block">{etiqueta}</span>
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
    <div className="card-soft space-y-4 p-5">
      <div>
        <label className="block">
          <span className="label-eyebrow mb-1 block">Buscar</span>
          <input
            className={campo}
            placeholder="Entidad, contratista, objeto…"
            value={filtros.q}
            onChange={(e) => set("q")(e.target.value)}
          />
        </label>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          Pega un <span className="num font-mono">CO1.PCCNTR.…</span> que no esté en el corpus y se
          analiza en vivo desde SECOP.
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
          <span className="label-eyebrow mb-1 block">Valor mínimo</span>
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

      <div className="flex items-center justify-between border-t border-hairline pt-3">
        <span className="num text-sm tabular-nums text-muted-foreground">
          {total.toLocaleString("es-CO")} contratos
        </span>
        {hayFiltros && (
          <button
            onClick={() => setFiltros({ ...FILTROS_VACIOS, q: filtros.q, orden: filtros.orden })}
            className="text-xs font-medium text-primary hover:underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>
    </div>
  );
}
