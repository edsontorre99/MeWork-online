"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, Loader2, Lock, User } from "lucide-react";
import { login, type LoginState } from "./auth-actions";
import { Logo } from "@/components/Logo";

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const [show, setShow] = useState(false);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-sand-50 px-4">
      <div className="card relative w-full max-w-sm p-8 shadow-[0_8px_40px_rgba(0,0,0,0.06)]">
        <div className="mb-8 flex flex-col items-center text-center">
          <h1>
            <Logo size={44} />
          </h1>
          <p className="mt-3 text-sm text-stone-500">Inicia sesión para continuar</p>
        </div>

        <form action={action} className="space-y-4">
          <div>
            <label htmlFor="username" className="label">Usuario</label>
            <div className="relative">
              <User className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input id="username" name="username" autoComplete="username" required autoFocus defaultValue={state.username} key={state.username} className="input pl-9" placeholder="Tu usuario" />
            </div>
          </div>
          <div>
            <label htmlFor="password" className="label">Contraseña</label>
            <div className="relative">
              <Lock className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                id="password"
                name="password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                required
                className="input px-9"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {state.error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {state.error}
            </p>
          )}

          <button type="submit" disabled={pending} className="btn-primary w-full py-2.5">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Iniciar Sesión
          </button>
        </form>
      </div>
    </main>
  );
}
