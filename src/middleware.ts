import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const user = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  // Login: si ya hay sesión, directo al dashboard
  if (pathname === "/") {
    return user ? NextResponse.redirect(new URL("/dashboard", req.url)) : NextResponse.next();
  }

  if (!user) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
}

export const config = {
  // /api/cron se protege con CRON_SECRET en su propia ruta
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.svg|api/cron/).*)"],
};
