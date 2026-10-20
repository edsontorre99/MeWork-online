import { SignJWT, jwtVerify } from "jose";

// Compatible con Edge (middleware) y Node (server actions).
export const SESSION_COOKIE = "toram_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 días

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("Falta JWT_SECRET en .env");
  return new TextEncoder().encode(s);
}

export async function createSessionToken(username: string) {
  return new SignJWT({ sub: username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
}

export async function verifySessionToken(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};
