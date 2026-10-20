import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "./session";

/** Verifica la sesión dentro de Server Actions y Server Components. */
export async function requireAuth(): Promise<string> {
  const user = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) throw new Error("Sesión expirada. Vuelve a iniciar sesión.");
  return user;
}
