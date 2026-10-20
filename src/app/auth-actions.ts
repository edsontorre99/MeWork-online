"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/session";

const digest = (s: string) => createHash("sha256").update(s).digest();
const safeEqual = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

export type LoginState = { error?: string; username?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const expectedUser = process.env.AUTH_USER ?? "";
  const expectedPass = process.env.AUTH_PASSWORD ?? "";

  // Se evalúan ambos para no revelar cuál campo falló
  const okUser = safeEqual(username.toLowerCase(), expectedUser.toLowerCase());
  const okPass = safeEqual(password, expectedPass);
  if (!expectedUser || !expectedPass || !okUser || !okPass) {
    await new Promise((r) => setTimeout(r, 600)); // frena intentos por fuerza bruta
    return { error: "Usuario o contraseña incorrectos.", username };
  }

  const token = await createSessionToken(expectedUser);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
  redirect("/dashboard");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}
