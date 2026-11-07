import { cookies } from "next/headers";

export const SESSION_COOKIE = "gritroom_session";

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function clientIp(request: Request): string | null {
  return request.headers.get("cf-connecting-ip");
}

export async function readJson<T>(request: Request): Promise<T | null> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return null;
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function normalizeEmail(email: unknown): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function getSessionTokenFromCookies(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

export function sessionCookieHeader(token: string, maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearSessionCookieHeader(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
