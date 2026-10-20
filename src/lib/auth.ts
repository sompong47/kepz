import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";

export type Role = "TENANT" | "SELLER" | "ADMIN";
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET ?? "dev-secret-change-me-dev-secret-change-me");
const COOKIE = "kepz_session";

export async function createSession(userId: string) {
  const token = await new SignJWT({ uid: userId }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("7d").sign(secret());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7 });
}
export async function destroySession() {
  (await cookies()).delete(COOKIE);
}
export async function getUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const u = await db.query.users.findFirst({ where: eq(users.id, String(payload.uid)) });
    return u ?? null;
  } catch {
    return null;
  }
}
export async function requireRole(...roles: Role[]) {
  const u = await getUser();
  if (!u) redirect("/login");
  if (!roles.includes(u.role)) redirect("/");
  return u;
}
export const homeFor = (r: Role) => (r === "ADMIN" ? "/admin" : r === "SELLER" ? "/seller" : "/tenant");
