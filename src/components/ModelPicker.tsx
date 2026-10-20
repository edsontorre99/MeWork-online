"use client";

import { useEffect, useId, useState } from "react";
import { listGeminiModels } from "@/app/actions";

type ModelInfo = { id: string; name: string };
type State = { models: ModelInfo[]; defaultModel: string; error?: string };

// Una sola consulta a Google por carga de página
let cache: Promise<State> | null = null;
function loadModels(): Promise<State> {
  cache ??= listGeminiModels().then((r) => {
    if (r.error) cache = null; // reintenta la próxima vez (p. ej. después de guardar la API Key)
    return r;
  });
  return cache;
}

export function useGeminiModels() {
  const [state, setState] = useState<State | null>(null);
  useEffect(() => {
    loadModels().then(setState);
  }, []);
  return state;
}

/** Campo de modelo: sugiere los modelos reales de tu cuenta, pero acepta cualquier nombre. */
export function ModelPicker({
  name,
  label,
  hint,
  defaultValue,
  value,
  onChange,
  placeholder,
}: {
  name?: string;
  label: string;
  hint?: string;
  placeholder?: string;
  defaultValue?: string | null;
  value?: string;
  onChange?: (v: string) => void;
}) {
  const listId = useId();
  const data = useGeminiModels();
  const controlled = value !== undefined;

  return (
    <div>
      <label className="label" htmlFor={`${listId}-input`}>{label}</label>
      <input
        id={`${listId}-input`}
        name={name}
        list={listId}
        autoComplete="off"
        className="input font-mono text-xs"
        placeholder={placeholder ?? (data?.defaultModel ? `Global: ${data.defaultModel}` : "Usar el modelo global")}
        {...(controlled ? { value, onChange: (e) => onChange?.(e.target.value) } : { defaultValue: defaultValue ?? "" })}
      />
      <datalist id={listId}>
        {data?.models.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </datalist>
      <p className="mt-1 text-[11px] text-stone-500">
        {hint && <>{hint} </>}
        {data === null
          ? "Cargando modelos de tu cuenta…"
          : data.error
            ? `No pude consultar la lista (${data.error}). Puedes escribir el nombre a mano.`
            : `${data.models.length} modelos disponibles en tu cuenta: haz clic en el campo para ver la lista.`}
      </p>
    </div>
  );
}
