"use server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, users, shops, assets, leases, payments } from "@/db";
import { createSession, destroySession, getUser, homeFor, requireRole } from "./auth";
import { buildPayments, CATEGORIES, CANVAS, defaultBox } from "./domain";

export type FormState = { error?: string } | undefined;
const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/* ---------- Auth ---------- */
export async function register(_: FormState, f: FormData): Promise<FormState> {
  const p = z
    .object({
      name: z.string().min(2, "กรอกชื่ออย่างน้อย 2 ตัวอักษร"),
      email: z.string().email("อีเมลไม่ถูกต้อง"),
      password: z.string().min(6, "รหัสผ่านอย่างน้อย 6 ตัวอักษร"),
      role: z.enum(["TENANT", "SELLER"]), // ห้ามสมัครเป็น ADMIN เอง
    })
    .safeParse({ name: s(f, "name"), email: s(f, "email").toLowerCase(), password: s(f, "password"), role: s(f, "role") });
  if (!p.success) return { error: p.error.issues[0].message };
  if (await db.query.users.findFirst({ where: eq(users.email, p.data.email) })) return { error: "อีเมลนี้ถูกใช้แล้ว" };
  const [u] = await db
    .insert(users)
    .values({ ...p.data, phone: s(f, "phone") || null, password: await bcrypt.hash(p.data.password, 10) })
    .returning();
  await createSession(u.id);
  redirect(homeFor(u.role));
}

export async function login(_: FormState, f: FormData): Promise<FormState> {
  const u = await db.query.users.findFirst({ where: eq(users.email, s(f, "email").toLowerCase()) });
  if (!u || !(await bcrypt.compare(String(f.get("password") ?? ""), u.password))) return { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
  await createSession(u.id);
  redirect(homeFor(u.role));
}

export async function logout() {
  await destroySession();
  redirect("/");
}

/* ---------- Seller: ร้าน & ทรัพย์สิน ---------- */
export async function createShop(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireRole("SELLER");
  const category = s(f, "category") as keyof typeof CATEGORIES;
  if (!(category in CATEGORIES)) return { error: "เลือกประเภทธุรกิจ" };
  if (s(f, "name").length < 2) return { error: "กรอกชื่อร้าน" };
  const [shop] = await db
    .insert(shops)
    .values({ name: s(f, "name"), category, description: s(f, "description") || null, location: s(f, "location") || null, phone: s(f, "phone") || null, ownerId: u.id })
    .returning();
  redirect(`/seller/shops/${shop.id}`);
}

async function ownShop(shopId: string) {
  const u = await requireRole("SELLER", "ADMIN");
  const shop = await db.query.shops.findFirst({ where: eq(shops.id, shopId) });
  if (!shop || (u.role !== "ADMIN" && shop.ownerId !== u.id)) throw new Error("ไม่มีสิทธิ์");
  return shop;
}

export async function addAsset(shopId: string, _: FormState, f: FormData): Promise<FormState> {
  await ownShop(shopId);
  const price = Number(f.get("price"));
  const code = s(f, "code");
  if (!code) return { error: "กรอกรหัส/ชื่อ เช่น A01" };
  if (!Number.isFinite(price) || price <= 0) return { error: "กรอกราคาให้ถูกต้อง" };
  const period = s(f, "period") === "DAY" ? "DAY" : "MONTH";
  try {
    await db.insert(assets).values({ shopId, code, size: s(f, "size") || null, note: s(f, "note") || null, price: Math.round(price), period });
  } catch {
    return { error: `รหัส ${code} มีอยู่แล้วในร้านนี้` };
  }
  revalidatePath(`/seller/shops/${shopId}`);
}

export async function deleteAsset(assetId: string, shopId: string) {
  await ownShop(shopId);
  await db.delete(assets).where(and(eq(assets.id, assetId), eq(assets.shopId, shopId)));
  revalidatePath(`/seller/shops/${shopId}`);
}

export async function decideLease(leaseId: string, decision: "ACTIVE" | "REJECTED" | "ENDED") {
  const lease = await db.query.leases.findFirst({ where: eq(leases.id, leaseId), with: { asset: true } });
  if (!lease) return;
  await ownShop(lease.asset.shopId);
  if (decision === "ACTIVE") {
    if (lease.status !== "PENDING") return;
    const clash = await hasOverlap(lease.assetId, lease.startDate, lease.endDate, lease.id);
    if (clash) return;
    await db.update(leases).set({ status: "ACTIVE" }).where(eq(leases.id, leaseId));
    const rows = buildPayments({ price: lease.asset.price, period: lease.asset.period, start: lease.startDate, end: lease.endDate, billing: lease.billing });
    await db.insert(payments).values(rows.map((r) => ({ ...r, leaseId })));
  } else {
    await db.update(leases).set({ status: decision }).where(eq(leases.id, leaseId));
  }
  revalidatePath("/seller", "layout");
}

export async function markPaid(paymentId: string) {
  const pay = await db.query.payments.findFirst({ where: eq(payments.id, paymentId), with: { lease: { with: { asset: true } } } });
  if (!pay) return;
  await ownShop(pay.lease.asset.shopId);
  await db.update(payments).set({ paidAt: new Date() }).where(eq(payments.id, paymentId));
  revalidatePath("/seller", "layout");
}

/* ---------- ผัง (floor plan) ---------- */
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number(n) || 0)));

export async function addShape(shopId: string, shape: "RECT" | "CIRCLE") {
  await ownShop(shopId);
  const existing = await db.query.assets.findMany({ where: eq(assets.shopId, shopId) });
  const codes = new Set(existing.map((a) => a.code));
  let n = existing.length + 1;
  while (codes.has("A" + String(n).padStart(2, "0"))) n++;
  const code = "A" + String(n).padStart(2, "0");
  // วางใต้รูปทรงที่ต่ำที่สุด เพื่อไม่ให้ทับของเดิม
  const sorted = [...existing].sort((p, q) => p.code.localeCompare(q.code, "th", { numeric: true }));
  const bottom = sorted.reduce((m, e, i) => { const d = defaultBox(i); return Math.max(m, (e.y ?? d.y) + (e.h ?? d.h)); }, 0);
  const h = shape === "CIRCLE" ? 80 : 70;
  const y = Math.min(bottom + 20, CANVAS.h - h);
  const x = 20 + ((existing.length * 110) % (CANVAS.w - 120));
  const [a] = await db.insert(assets).values({ shopId, code, price: 0, period: "MONTH", shape, x, y: Math.round(y / 10) * 10, w: shape === "CIRCLE" ? 80 : 100, h }).returning();
  revalidatePath(`/seller/shops/${shopId}`);
  return a.id;
}

export async function saveLayout(shopId: string, assetId: string, b: { x: number; y: number; w: number; h: number; shape: "RECT" | "CIRCLE" }) {
  await ownShop(shopId);
  const w = clamp(b.w, 30, CANVAS.w), h = clamp(b.h, 30, CANVAS.h);
  await db.update(assets).set({ x: clamp(b.x, 0, CANVAS.w - w), y: clamp(b.y, 0, CANVAS.h - h), w, h, shape: b.shape === "CIRCLE" ? "CIRCLE" : "RECT" })
    .where(and(eq(assets.id, assetId), eq(assets.shopId, shopId)));
}

export async function updateAsset(shopId: string, assetId: string, _: FormState, f: FormData): Promise<FormState> {
  await ownShop(shopId);
  const code = s(f, "code");
  const price = Number(f.get("price"));
  if (!code) return { error: "กรอกรหัส/ชื่อ" };
  if (!Number.isFinite(price) || price < 0) return { error: "ราคาไม่ถูกต้อง" };
  try {
    await db.update(assets).set({ code, size: s(f, "size") || null, note: s(f, "note") || null, price: Math.round(price), period: s(f, "period") === "DAY" ? "DAY" : "MONTH" })
      .where(and(eq(assets.id, assetId), eq(assets.shopId, shopId)));
  } catch {
    return { error: `รหัส ${code} ซ้ำในร้านนี้` };
  }
  revalidatePath(`/seller/shops/${shopId}`);
  return { error: undefined };
}

/* ---------- Tenant: ขอเช่า ---------- */
async function hasOverlap(assetId: string, start: Date, end: Date, ignoreId?: string) {
  const rows = await db.query.leases.findMany({ where: and(eq(leases.assetId, assetId), inArray(leases.status, ["ACTIVE"])) });
  return rows.some((l) => l.id !== ignoreId && +l.startDate < +end && +l.endDate > +start);
}

export async function requestLease(assetId: string, _: FormState, f: FormData): Promise<FormState> {
  const u = await getUser();
  if (!u) redirect("/login");
  if (u.role !== "TENANT") return { error: "เฉพาะบัญชีผู้เช่าเท่านั้นที่ขอเช่าได้" };
  const asset = await db.query.assets.findFirst({ where: eq(assets.id, assetId), with: { shop: true } });
  if (!asset || !asset.shop.active) return { error: "ไม่พบรายการ" };
  if (asset.price <= 0) return { error: "รายการนี้ยังไม่เปิดให้เช่า" };
  const start = new Date(s(f, "start"));
  const end = new Date(s(f, "end"));
  if (isNaN(+start) || isNaN(+end)) return { error: "เลือกวันที่เริ่มและวันสิ้นสุด" };
  const today = new Date(new Date().toDateString());
  if (+start < +today) return { error: "วันเริ่มต้องไม่ใช่วันที่ผ่านมาแล้ว" };
  if (+end <= +start) return { error: "วันสิ้นสุดต้องหลังวันเริ่ม" };
  if (await hasOverlap(assetId, start, end)) return { error: "ช่วงเวลานี้มีผู้เช่าแล้ว" };
  const b = s(f, "billing");
  const billing = b === "HALF_YEAR" || b === "YEAR" ? b : "MONTH";
  await db.insert(leases).values({ assetId, tenantId: u.id, startDate: start, endDate: end, billing });
  redirect("/tenant");
}

export async function cancelLease(leaseId: string) {
  const u = await requireRole("TENANT");
  await db.update(leases).set({ status: "ENDED" }).where(and(eq(leases.id, leaseId), eq(leases.tenantId, u.id), eq(leases.status, "PENDING")));
  revalidatePath("/tenant");
}

/* ---------- Admin ---------- */
export async function toggleShop(shopId: string) {
  await requireRole("ADMIN");
  const sh = await db.query.shops.findFirst({ where: eq(shops.id, shopId) });
  if (sh) await db.update(shops).set({ active: !sh.active }).where(eq(shops.id, shopId));
  revalidatePath("/admin");
}
