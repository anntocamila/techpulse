import { useState } from "react";
import { FEED_SOURCES } from "../data/feeds";
import { CATEGORIES } from "../data/categories";
import type { FailedSource } from "../types";

interface Props {
  failedSources: FailedSource[];
  disabledSources: Set<string>;
  onToggleSource: (id: string) => void;
}

export default function RightPanel({ failedSources, disabledSources, onToggleSource }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const enabledCount = FEED_SOURCES.length - disabledSources.size;

  return (
    <div className="hidden w-80 shrink-0 flex-col gap-4 p-4 xl:flex">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-zinc-50">Fuentes</h2>
          <span className="text-xs text-zinc-500">
            {enabledCount}/{FEED_SOURCES.length} activas
          </span>
        </div>

        <ul className="flex flex-col gap-1">
          {CATEGORIES.map((cat) => {
            const sources = FEED_SOURCES.filter((s) => s.category === cat.id);
            if (sources.length === 0) return null;
            const isOpen = open === cat.id;
            const activeHere = sources.filter((s) => !disabledSources.has(s.id)).length;
            return (
              <li key={cat.id}>
                <button
                  onClick={() => setOpen(isOpen ? null : cat.id)}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm text-zinc-200 hover:bg-zinc-900"
                >
                  <span>
                    {cat.emoji} {cat.label}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {activeHere}/{sources.length} {isOpen ? "▾" : "▸"}
                  </span>
                </button>
                {isOpen && (
                  <ul className="mb-2 mt-1 flex flex-col gap-1 pl-2">
                    {sources.map((s) => {
                      const enabled = !disabledSources.has(s.id);
                      return (
                        <li key={s.id}>
                          <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-zinc-900">
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={() => onToggleSource(s.id)}
                              className="accent-sky-500"
                            />
                            <span className={enabled ? "text-zinc-300" : "text-zinc-600 line-through"}>
                              {s.name}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-zinc-600">
          Los cambios se aplican en la próxima actualización y se recuerdan en este navegador.
        </p>
      </div>

      {failedSources.length > 0 && (
        <div className="rounded-2xl border border-amber-900/50 bg-amber-950/20 p-4 text-sm text-amber-400">
          <p className="font-semibold">Sin datos por ahora ({failedSources.length}):</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {failedSources.map((f) => (
              <li key={f.name} title={f.reason}>
                <span className="text-amber-300">{f.name}</span>
                <span className="block break-words text-xs text-amber-500/70">{f.reason}</span>
              </li>
            ))}
          </ul>
          <button
            onClick={() => {
              const text = failedSources.map((f) => `${f.name}: ${f.reason}`).join("\n");
              navigator.clipboard?.writeText(text).catch(() => {});
            }}
            className="mt-3 rounded-full border border-amber-800 px-3 py-1 text-xs text-amber-300 hover:bg-amber-900/30"
          >
            Copiar diagnóstico
          </button>
        </div>
      )}

      <p className="px-1 text-xs text-zinc-600">
        TechPulse agrega titulares de RSS y APIs públicas de IA, startups, negocios, eventos,
        tecnología y comunidad. No almacena datos personales.
      </p>
    </div>
  );
}
