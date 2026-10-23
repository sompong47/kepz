"use server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, users, shops, assets, leases, payments, floors, features, assetPhotos, floorsOf } from "@/db";
import { MAX_BYTES, MAX_PER_ASSET, removePhotoFile, removePhotoFilesOf, savePhotoFile, sniffImage } from "./photos";
import { createSession, destroySession, getUser, homeFor, requireRole, requireUser } from "./auth";
import { buildPayments, CATEGORIES, CANVAS, FEATURES, FLOOR_TEMPLATES, MIN_ASSET_PX, defaultBox, toPx, type FeatureKind, hasPayInfo } from "./domain";

export type FormState = { error?: string; ids?: string[] } | undefined;
const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/* ---------- Auth ---------- */
export async function register(_: FormState, f: FormData): Promise<FormState> {
  const p = z
    .object({
      name: z.string().min(2, "กรอกชื่ออย่างน้อย 2 ตัวอักษร"),
      email: z.string().email("อีเมลไม่ถูกต้อง"),
      password: z.string().min(6, "รหัสผ่านอย่างน้อย 6 ตัวอักษร"),
    })
    .safeParse({ name: s(f, "name"), email: s(f, "email").toLowerCase(), password: s(f, "password") });
  if (!p.success) return { error: p.error.issues[0].message };
  if (await db.query.users.findFirst({ where: eq(users.email, p.data.email) })) return { error: "อีเมลนี้ถูกใช้แล้ว" };
  const [u] = await db
    .insert(users)
    .values({ ...p.data, role: "TENANT", phone: s(f, "phone") || null, password: await bcrypt.hash(p.data.password, 10) })
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

/** เข้าสู่ระบบบัญชีตัวอย่าง (Demo) ในคลิกเดียว เพื่อให้หัวหน้า/ผู้ทดสอบสลับบทบาทได้ทันที */
export async function demoQuickLogin(email: string, redirectTo?: string) {
  const u = await db.query.users.findFirst({ where: eq(users.email, email.toLowerCase()) });
  if (!u) redirect("/login");
  await createSession(u.id);
  redirect(redirectTo ?? (u.role === "SELLER" ? "/seller" : homeFor(u.role)));
}

/* ---------- Seller: ร้าน & ทรัพย์สิน ---------- */
export async function createShop(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser();
  const category = s(f, "category") as keyof typeof CATEGORIES;
  if (!(category in CATEGORIES)) return { error: "เลือกประเภทธุรกิจ" };
  if (s(f, "name").length < 2) return { error: "กรอกชื่อร้าน" };
  let coverPhoto: string | null = null;
  const cover = f.get("cover");
  if (cover instanceof File && cover.size > 0) {
    if (cover.size > MAX_BYTES) return { error: "รูปหน้าร้านต้องไม่เกิน 5MB" };
    const data = new Uint8Array(await cover.arrayBuffer());
    const kind = sniffImage(data);
    if (!kind) return { error: "รองรับเฉพาะไฟล์รูป JPG, PNG, WEBP, GIF" };
    coverPhoto = `${crypto.randomUUID()}.${kind.ext}`;
    await savePhotoFile(coverPhoto, data);
  }
  const [shop] = await db
    .insert(shops)
    .values({ name: s(f, "name"), category, description: s(f, "description") || null, location: s(f, "location") || null, mapUrl: s(f, "mapUrl") || null, coverPhoto, phone: s(f, "phone") || null, ownerId: u.id, published: false })
    .returning();
  const [floor] = await floorsOf(shop.id);
  const tplId = s(f, "templateId");
  if (tplId && FLOOR_TEMPLATES.some((t) => t.id === tplId)) {
    await applyTemplate(shop.id, floor.id, tplId);
  }
  redirect(`/seller/shops/${shop.id}`);
}

async function ownShop(shopId: string) {
  const u = await requireUser();
  const shop = await db.query.shops.findFirst({ where: eq(shops.id, shopId) });
  if (!shop || (u.role !== "ADMIN" && shop.ownerId !== u.id)) throw new Error("ไม่มีสิทธิ์");
  return shop;
}

/** อ่านกว้าง × ยาว (เมตร) จากฟอร์ม; เว้นว่างทั้งคู่ = ไม่เปลี่ยน */
function readDims(f: FormData): { error: string } | { w: number; h: number } | null {
  const wm = s(f, "wm"), hm = s(f, "hm");
  if (!wm && !hm) return null;
  const w = Number(wm), h = Number(hm);
  if (!(w >= 1 && h >= 1)) return { error: "กว้างและยาวต้องอย่างน้อย 1 เมตร" };
  if (toPx(w) > CANVAS.maxW || toPx(h) > CANVAS.maxH) return { error: "ขนาดใหญ่เกินไป" };
  return { w: toPx(w), h: toPx(h) };
}

export async function addAsset(shopId: string, _: FormState, f: FormData): Promise<FormState> {
  await ownShop(shopId);
  const price = Number(f.get("price"));
  const code = s(f, "code");
  if (!code) return { error: "กรอกรหัส/ชื่อ เช่น A01" };
  if (!Number.isFinite(price) || price <= 0) return { error: "กรอกราคาให้ถูกต้อง" };
  const period = s(f, "period") === "DAY" ? "DAY" : "MONTH";
  const dims = readDims(f);
  if (dims && "error" in dims) return dims;
  const [floor] = await floorsOf(shopId);
  try {
    await db.insert(assets).values({ shopId, floorId: floor.id, code, size: s(f, "size") || null, note: s(f, "note") || null, price: Math.round(price), period, listed: true, ...(dims && fit({ x: 20, y: snap((await floorBottom(floor.id)) + 20), ...dims }, floor, MIN_ASSET_PX)) });
  } catch {
    return { error: `รหัส ${code} มีอยู่แล้วในร้านนี้` };
  }
  revalidatePath(`/seller/shops/${shopId}`);
}

export async function deleteAsset(assetId: string, shopId: string) {
  await ownShop(shopId);
  const a = await db.query.assets.findFirst({ where: and(eq(assets.id, assetId), eq(assets.shopId, shopId)) });
  if (!a) return;
  await removePhotoFilesOf([a.id]);
  await db.delete(assets).where(eq(assets.id, a.id));
  revalidatePath(`/seller/shops/${shopId}`);
}

/* ---------- เปิดให้เช่า ---------- */
/** เปิด/ปิดร้าน; จะเปิดได้ต้องมีอย่างน้อย 1 รายการที่เปิดให้เช่า */
export async function setShopPublished(shopId: string, published: boolean): Promise<FormState> {
  const shop = await ownShop(shopId);
  if (published && !(await db.query.assets.findFirst({ where: and(eq(assets.shopId, shopId), eq(assets.listed, true)) })))
    return { error: "ยังไม่มีรายการที่เปิดให้เช่า — ตั้งราคาและเปิดให้เช่าอย่างน้อย 1 รายการก่อน" };
  if (published && !hasPayInfo(shop)) return { error: "ยังไม่ได้ตั้งช่องทางรับเงิน — ใส่บัญชีธนาคาร พร้อมเพย์ หรือรูป QR ก่อนเปิดร้าน" };
  await db.update(shops).set({ published: !!published }).where(eq(shops.id, shopId));
  revalidatePath("/", "layout");
  return { error: undefined };
}

/** ตั้งราคา และ/หรือ เปิด-ปิดการเช่าหลายรายการพร้อมกัน; ids ว่าง = ทุกรายการในร้าน */
export async function setListing(shopId: string, ids: string[] | null, v: { price?: number; period?: "DAY" | "MONTH"; listed?: boolean }) {
  await ownShop(shopId);
  const where = ids === null ? eq(assets.shopId, shopId) : and(eq(assets.shopId, shopId), inArray(assets.id, (Array.isArray(ids) ? ids : []).slice(0, 1000)));
  const rows = await db.query.assets.findMany({ where });
  const price = v.price === undefined ? undefined : Math.round(Number(v.price));
  if (price !== undefined && !(price >= 0)) return { updated: 0, skipped: [] as string[] };
  const period = v.period === "DAY" || v.period === "MONTH" ? v.period : undefined;
  const skipped: string[] = [];
  db.transaction((tx) => {
    for (const a of rows) {
      const p = price ?? a.price;
      let listed = v.listed ?? a.listed;
      if (listed && p <= 0) { listed = false; if (v.listed) skipped.push(a.code); }
      tx.update(assets).set({ price: p, ...(period && { period }), listed }).where(eq(assets.id, a.id)).run();
    }
  });
  revalidatePath("/", "layout");
  return { updated: rows.length - skipped.length, skipped };
}

export async function toggleListed(assetId: string, shopId: string) {
  const a = await db.query.assets.findFirst({ where: and(eq(assets.id, assetId), eq(assets.shopId, shopId)) });
  if (a) await setListing(shopId, [a.id], { listed: !a.listed });
}

/* ---------- รูปของห้อง/ช่อง ---------- */
export async function uploadAssetPhoto(shopId: string, assetId: string, f: FormData): Promise<FormState> {
  await ownShop(shopId);
  const a = await db.query.assets.findFirst({ where: and(eq(assets.id, assetId), eq(assets.shopId, shopId)), with: { photos: true } });
  if (!a) return { error: "ไม่พบรายการ" };
  if (a.photos.length >= MAX_PER_ASSET) return { error: `เพิ่มรูปได้สูงสุด ${MAX_PER_ASSET} รูป` };
  const file = f.get("file");
  if (!(file instanceof File) || !file.size) return { error: "ไม่พบไฟล์" };
  if (file.size > MAX_BYTES) return { error: "ไฟล์ใหญ่เกิน 5MB" };
  const data = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(data);
  if (!kind) return { error: "รองรับเฉพาะ JPG, PNG, WEBP, GIF" };
  const id = crypto.randomUUID();
  const name = `${id}.${kind.ext}`;
  await savePhotoFile(name, data);
  await db.insert(assetPhotos).values({ id, assetId, file: name, mime: kind.mime });
  revalidatePath(`/seller/shops/${shopId}`);
  revalidatePath(`/shops/${shopId}`);
  return { error: undefined };
}

export async function deleteAssetPhoto(shopId: string, photoId: string) {
  await ownShop(shopId);
  const ph = await db.query.assetPhotos.findFirst({ where: eq(assetPhotos.id, photoId), with: { asset: true } });
  if (!ph || ph.asset.shopId !== shopId) return;
  await db.delete(assetPhotos).where(eq(assetPhotos.id, photoId));
  await removePhotoFile(ph.file);
  revalidatePath(`/seller/shops/${shopId}`);
  revalidatePath(`/shops/${shopId}`);
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
    // สลิปที่แนบมาตอนขอเช่า = สลิปของงวดแรก
    await db.insert(payments).values(rows.map((r, i) => ({ ...r, leaseId, ...(i === 0 && lease.slip && { slip: lease.slip, slipAt: lease.createdAt ?? new Date() }) })));
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
const snap = (n: number) => Math.round(n / CANVAS.grid) * CANVAS.grid;
type Box = { x: number; y: number; w: number; h: number; rot?: number };
const normRot = (r: unknown) => ((Math.round(Number(r) || 0) % 360) + 360) % 360;

async function ownFloor(shopId: string, floorId: string) {
  await ownShop(shopId);
  const floor = await db.query.floors.findFirst({ where: and(eq(floors.id, floorId), eq(floors.shopId, shopId)) });
  if (!floor) throw new Error("ไม่พบชั้นนี้");
  return floor;
}
/** จำกัดขนาด/ตำแหน่งให้อยู่ในชั้น โดยคิดจากกรอบของรูปที่หมุนแล้ว */
const fit = (b: Box, f: { w: number; h: number }, min: number) => {
  const rot = normRot(b.rot);
  const w = clamp(b.w, min, f.w), h = clamp(b.h, min, f.h);
  const t = (rot * Math.PI) / 180, c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t));
  const hw = (w * c + h * s) / 2, hh = (w * s + h * c) / 2;
  const cx = Math.min(f.w - hw, Math.max(hw, (Number(b.x) || 0) + w / 2)), cy = Math.min(f.h - hh, Math.max(hh, (Number(b.y) || 0) + h / 2));
  return { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h, rot };
};

/** กล่องของทุกอย่างที่วางอยู่บนชั้น */
async function floorBoxes(floorId: string) {
  const [as, fs] = await Promise.all([db.query.assets.findMany({ where: eq(assets.floorId, floorId) }), db.query.features.findMany({ where: eq(features.floorId, floorId) })]);
  return [...as.map((a, i) => { const d = defaultBox(i); return { x: a.x ?? d.x, y: a.y ?? d.y, w: a.w ?? d.w, h: a.h ?? d.h }; }), ...fs];
}
/** ขอบล่างสุดของสิ่งที่วางอยู่บนชั้น ใช้หาที่ว่างสำหรับของใหม่ */
const floorBottom = async (floorId: string) => (await floorBoxes(floorId)).reduce((m, b) => Math.max(m, b.y + b.h), 0);

/** สร้างรหัสถัดไปที่ยังไม่ซ้ำ เช่น A01, A02 … */
async function codeMaker(shopId: string, prefix: string) {
  const codes = new Set((await db.query.assets.findMany({ where: eq(assets.shopId, shopId), columns: { code: true } })).map((a) => a.code));
  let n = 1;
  return () => {
    while (codes.has(prefix + String(n).padStart(2, "0"))) n++;
    const c = prefix + String(n).padStart(2, "0");
    codes.add(c);
    return c;
  };
}

export async function addShape(shopId: string, floorId: string, shape: "RECT" | "CIRCLE") {
  const floor = await ownFloor(shopId, floorId);
  const code = (await codeMaker(shopId, "A"))();
  const w = shape === "CIRCLE" ? 80 : 100, h = shape === "CIRCLE" ? 80 : 70;
  const b = fit({ x: 20, y: snap((await floorBottom(floorId)) + 20), w, h }, floor, MIN_ASSET_PX);
  const [a] = await db.insert(assets).values({ shopId, floorId, code, price: 0, period: "MONTH", shape, ...b }).returning();
  revalidatePath(`/seller/shops/${shopId}`);
  return a.id;
}

export async function saveLayout(shopId: string, assetId: string, b: Box & { shape: "RECT" | "CIRCLE" }) {
  await ownShop(shopId);
  const a = await db.query.assets.findFirst({ where: and(eq(assets.id, assetId), eq(assets.shopId, shopId)), with: { floor: true } });
  if (!a) return;
  await db.update(assets).set({ ...fit({ ...b, rot: b.rot ?? a.rot }, a.floor ?? CANVAS, MIN_ASSET_PX), shape: b.shape === "CIRCLE" ? "CIRCLE" : "RECT" }).where(eq(assets.id, assetId));
}

export async function duplicateAsset(shopId: string, assetId: string) {
  await ownShop(shopId);
  const a = await db.query.assets.findFirst({ where: and(eq(assets.id, assetId), eq(assets.shopId, shopId)), with: { floor: true } });
  if (!a) return null;
  const prefix = a.code.match(/^\D*/)?.[0] || "A";
  const d = defaultBox(0);
  const b = fit({ x: (a.x ?? d.x) + (a.w ?? d.w) + 10, y: a.y ?? d.y, w: a.w ?? d.w, h: a.h ?? d.h, rot: a.rot }, a.floor ?? CANVAS, MIN_ASSET_PX);
  const [n] = await db.insert(assets).values({ shopId, floorId: a.floorId, code: (await codeMaker(shopId, prefix))(), size: a.size, price: a.price, period: a.period, note: a.note, shape: a.shape, listed: a.listed, ...b }).returning();
  revalidatePath(`/seller/shops/${shopId}`);
  return n.id;
}

/* ชั้น/โซน */
export async function addFloor(shopId: string) {
  await ownShop(shopId);
  const list = await floorsOf(shopId);
  const [f] = await db.insert(floors).values({ shopId, name: `ชั้น ${list.length + 1}`, sort: list.length }).returning();
  revalidatePath(`/seller/shops/${shopId}`);
  return f.id;
}

export async function updateFloor(shopId: string, floorId: string, v: { name: string; w: number; h: number }): Promise<FormState> {
  await ownFloor(shopId, floorId);
  const name = String(v.name ?? "").trim().slice(0, 40);
  if (!name) return { error: "กรอกชื่อชั้น/โซน" };
  // ขนาดต้องไม่เล็กกว่าของที่วางอยู่แล้ว
  const boxes = await floorBoxes(floorId);
  const minW = Math.max(300, ...boxes.map((b) => b.x + b.w)), minH = Math.max(200, ...boxes.map((b) => b.y + b.h));
  await db.update(floors).set({ name, w: clamp(v.w, minW, CANVAS.maxW), h: clamp(v.h, minH, CANVAS.maxH) }).where(eq(floors.id, floorId));
  revalidatePath(`/seller/shops/${shopId}`);
  return { error: undefined };
}

export async function deleteFloor(shopId: string, floorId: string): Promise<FormState> {
  await ownFloor(shopId, floorId);
  if ((await floorsOf(shopId)).length <= 1) return { error: "ต้องมีอย่างน้อย 1 ชั้น" };
  if (await db.query.assets.findFirst({ where: eq(assets.floorId, floorId) })) return { error: "ลบรายการให้เช่าในชั้นนี้ออกก่อน" };
  await db.delete(floors).where(eq(floors.id, floorId));
  revalidatePath(`/seller/shops/${shopId}`);
  return { error: undefined };
}

/* องค์ประกอบผัง (ไม่ได้ให้เช่า) */
const isKind = (k: unknown): k is FeatureKind => typeof k === "string" && k in FEATURES;

export async function addFeature(shopId: string, floorId: string, kind: FeatureKind) {
  const floor = await ownFloor(shopId, floorId);
  if (!isKind(kind)) return null;
  const d = FEATURES[kind];
  const b = fit({ x: 20, y: snap((await floorBottom(floorId)) + 20), w: d.w, h: d.h }, floor, 10);
  const [f] = await db.insert(features).values({ shopId, floorId, kind, label: kind === "TEXT" ? "ข้อความ" : null, ...b }).returning();
  revalidatePath(`/seller/shops/${shopId}`);
  return f.id;
}

export async function saveFeature(shopId: string, id: string, v: Box & { label?: string | null; kind?: string }) {
  await ownShop(shopId);
  const f = await db.query.features.findFirst({ where: and(eq(features.id, id), eq(features.shopId, shopId)), with: { floor: true } });
  if (!f) return;
  const meta = v.label !== undefined || v.kind !== undefined;
  await db.update(features).set({
    ...fit({ ...v, rot: v.rot ?? f.rot }, f.floor, 10),
    ...(v.label !== undefined && { label: String(v.label ?? "").trim().slice(0, 60) || null }),
    ...(isKind(v.kind) && { kind: v.kind }),
  }).where(eq(features.id, id));
  if (meta) revalidatePath(`/seller/shops/${shopId}`);
}

const HEX = /^#[0-9a-f]{6}$/i;
/** เปลี่ยนสีองค์ประกอบผังหลายชิ้นพร้อมกัน; null = กลับเป็นสีตั้งต้น */
export async function setFeatureColor(shopId: string, ids: string[], color: string | null) {
  await ownShop(shopId);
  if (color !== null && !HEX.test(String(color))) return;
  const list = (Array.isArray(ids) ? ids : []).filter((i) => typeof i === "string").slice(0, 1000);
  if (!list.length) return;
  await db.update(features).set({ color: color && color.toLowerCase() }).where(and(eq(features.shopId, shopId), inArray(features.id, list)));
  revalidatePath(`/seller/shops/${shopId}`);
}

export async function duplicateFeature(shopId: string, id: string) {
  await ownShop(shopId);
  const f = await db.query.features.findFirst({ where: and(eq(features.id, id), eq(features.shopId, shopId)), with: { floor: true } });
  if (!f) return null;
  const b = fit({ x: f.x + 20, y: f.y + 20, w: f.w, h: f.h, rot: f.rot }, f.floor, 10);
  const [n] = await db.insert(features).values({ shopId, floorId: f.floorId, kind: f.kind, label: f.label, color: f.color, ...b }).returning();
  revalidatePath(`/seller/shops/${shopId}`);
  return n.id;
}

export async function deleteFeature(shopId: string, id: string) {
  await ownShop(shopId);
  await db.delete(features).where(and(eq(features.id, id), eq(features.shopId, shopId)));
  revalidatePath(`/seller/shops/${shopId}`);
}

/** ลบหลายรายการพร้อมกัน (ห้อง + องค์ประกอบผัง); ข้ามห้องที่มีสัญญาหรือคำขอเช่าค้างอยู่ */
export async function deleteItems(shopId: string, ids: string[]) {
  await ownShop(shopId);
  const list = (Array.isArray(ids) ? ids : []).filter((i) => typeof i === "string").slice(0, 1000);
  if (!list.length) return { deleted: 0, deletedIds: [] as string[], photos: [] as { assetId: string; file: string }[], skipped: [] as string[] };
  const rows = await db.query.assets.findMany({ where: and(eq(assets.shopId, shopId), inArray(assets.id, list)), with: { leases: true } });
  const busy = rows.filter((a) => a.leases.some((l) => l.status === "ACTIVE" || l.status === "PENDING"));
  const free = rows.filter((a) => !busy.includes(a)).map((a) => a.id);
  const fIds = list.filter((i) => !rows.some((a) => a.id === i));
  // เก็บไฟล์รูปไว้ (ไม่ลบจากดิสก์) เพื่อให้ Ctrl+Z กู้ห้องพร้อมรูปกลับมาได้
  const photos = free.length ? await db.query.assetPhotos.findMany({ where: inArray(assetPhotos.assetId, free), columns: { assetId: true, file: true } }) : [];
  const deletedIds = db.transaction((tx) => {
    const a = free.length ? tx.delete(assets).where(and(eq(assets.shopId, shopId), inArray(assets.id, free))).returning({ id: assets.id }).all() : [];
    const f = fIds.length ? tx.delete(features).where(and(eq(features.shopId, shopId), inArray(features.id, fIds))).returning({ id: features.id }).all() : [];
    return [...a, ...f].map((r) => r.id);
  });
  revalidatePath(`/seller/shops/${shopId}`);
  return { deleted: deletedIds.length, deletedIds, photos, skipped: busy.map((a) => a.code) };
}

/* วาง (Ctrl+V) หรือกู้คืน (Ctrl+Z) รายการจากสแนปช็อตฝั่งเบราว์เซอร์ */
const boxSchema = { x: z.number(), y: z.number(), w: z.number(), h: z.number(), rot: z.number().optional(), floorId: z.string() };
const snapSchema = z.array(z.discriminatedUnion("t", [
  z.object({
    t: z.literal("A"), ...boxSchema, code: z.string().trim().min(1).max(40), size: z.string().max(40).nullable(), price: z.number().min(0), listed: z.boolean().optional(),
    period: z.enum(["DAY", "MONTH"]), note: z.string().max(500).nullable(), shape: z.enum(["RECT", "CIRCLE"]),
    photos: z.array(z.object({ file: z.string().regex(/^[0-9a-f-]{36}\.(jpg|png|gif|webp)$/) })).max(MAX_PER_ASSET).optional(),
  }),
  z.object({ t: z.literal("F"), ...boxSchema, kind: z.enum(Object.keys(FEATURES) as [FeatureKind, ...FeatureKind[]]), label: z.string().max(60).nullable(), color: z.string().regex(/^#[0-9a-f]{6}$/i).nullable().optional() }),
])).max(500);
const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };

/** ใช้รหัสเดิมถ้ายังว่าง (เช่น ตัดแล้ววาง / กู้คืน) ไม่งั้นออกรหัสใหม่; restore=true ผูกรูปเดิมกลับด้วย. คืน id ใหม่ตามลำดับ (null = ข้าม) */
export async function pasteItems(shopId: string, input: unknown, restore: boolean): Promise<(string | null)[]> {
  await ownShop(shopId);
  const p = snapSchema.safeParse(input);
  if (!p.success) return [];
  const fl = new Map((await db.query.floors.findMany({ where: eq(floors.shopId, shopId) })).map((f) => [f.id, f]));
  const codes = new Set((await db.query.assets.findMany({ where: eq(assets.shopId, shopId), columns: { code: true } })).map((a) => a.code));
  const takeCode = (code: string) => {
    if (!codes.has(code)) return codes.add(code), code;
    const prefix = code.match(/^\D*/)?.[0] || "A";
    let n = 1;
    while (codes.has(prefix + String(n).padStart(2, "0"))) n++;
    const c = prefix + String(n).padStart(2, "0");
    codes.add(c);
    return c;
  };
  const ids = db.transaction((tx) =>
    p.data.map((s) => {
      const floor = fl.get(s.floorId);
      if (!floor) return null;
      const b = fit(s, floor, s.t === "A" ? MIN_ASSET_PX : 10);
      if (s.t === "F") return tx.insert(features).values({ shopId, floorId: floor.id, kind: s.kind, label: s.label, color: s.color ?? null, ...b }).returning({ id: features.id }).get().id;
      const { id } = tx.insert(assets).values({ shopId, floorId: floor.id, code: takeCode(s.code), size: s.size, price: Math.round(s.price), period: s.period, note: s.note, shape: s.shape, listed: !!s.listed && s.price > 0, ...b }).returning({ id: assets.id }).get();
      if (restore && s.photos?.length)
        tx.insert(assetPhotos).values(s.photos.map((ph) => ({ assetId: id, file: ph.file, mime: MIME[ph.file.split(".").pop()!] }))).run();
      return id;
    }),
  );
  revalidatePath(`/seller/shops/${shopId}`);
  return ids;
}

/* ตัวช่วยสร้างผังอัตโนมัติ: วางห้อง/ช่องเป็นแถว คั่นด้วยทางเดินทุก ๆ N แถว */
const genSchema = z.object({
  prefix: z.string().trim().max(5).regex(/^\D*$/, "คำนำหน้าห้ามมีตัวเลข"),
  rows: z.coerce.number().int().min(1, "จำนวนแถวอย่างน้อย 1").max(30, "จำนวนแถวไม่เกิน 30"),
  cols: z.coerce.number().int().min(1, "จำนวนต่อแถวอย่างน้อย 1").max(40, "จำนวนต่อแถวไม่เกิน 40"),
  // ขนาดเป็นเมตร
  w: z.coerce.number().min(1, "กว้างอย่างน้อย 1 ม.").max(20, "กว้างไม่เกิน 20 ม."),
  h: z.coerce.number().min(1, "ยาวอย่างน้อย 1 ม.").max(20, "ยาวไม่เกิน 20 ม."),
  gap: z.coerce.number().min(0).max(5, "ระยะห่างไม่เกิน 5 ม."),
  aisleEvery: z.coerce.number().int().min(0).max(30),
  aisle: z.coerce.number().min(1, "ทางเดินกว้างอย่างน้อย 1 ม.").max(15, "ทางเดินกว้างไม่เกิน 15 ม."),
  price: z.coerce.number().min(0, "ราคาไม่ถูกต้อง"),
  period: z.enum(["DAY", "MONTH"]),
  size: z.string().trim().max(40),
});

export async function generateLayout(shopId: string, floorId: string, _: FormState, f: FormData): Promise<FormState> {
  const floor = await ownFloor(shopId, floorId);
  const p = genSchema.safeParse(Object.fromEntries(f));
  if (!p.success) return { error: p.error.issues[0].message };
  const o = { ...p.data, w: toPx(p.data.w), h: toPx(p.data.h), gap: toPx(p.data.gap), aisle: toPx(p.data.aisle) };
  if (o.rows * o.cols > 300) return { error: "สร้างได้ครั้งละไม่เกิน 300 รายการ" };
  const x0 = 20, y0 = snap((await floorBottom(floorId)) + 20);
  const rowW = o.cols * o.w + (o.cols - 1) * o.gap;
  const next = await codeMaker(shopId, o.prefix);
  const newAssets: (typeof assets.$inferInsert)[] = [];
  const roads: (typeof features.$inferInsert)[] = [];
  let y = y0;
  for (let r = 0; r < o.rows; r++) {
    if (o.aisleEvery > 0 && r > 0 && r % o.aisleEvery === 0) {
      roads.push({ shopId, floorId, kind: "ROAD", x: x0, y, w: rowW, h: o.aisle });
      y += o.aisle + o.gap;
    }
    for (let c = 0; c < o.cols; c++)
      newAssets.push({ shopId, floorId, code: next(), size: o.size || null, price: Math.round(o.price), period: o.period, listed: o.price > 0, shape: "RECT", x: x0 + c * (o.w + o.gap), y, w: o.w, h: o.h });
    y += o.h + o.gap;
  }
  const needW = x0 + rowW + 20, needH = y + 20;
  if (needW > CANVAS.maxW || needH > CANVAS.maxH) return { error: "ผังใหญ่เกินพื้นที่สูงสุด ลองลดจำนวนแถว/คอลัมน์ หรือเพิ่มชั้นใหม่" };
  const ids = db.transaction((tx) => {
    if (needW > floor.w || needH > floor.h) tx.update(floors).set({ w: Math.max(floor.w, needW), h: Math.max(floor.h, needH) }).where(eq(floors.id, floorId)).run();
    const a = tx.insert(assets).values(newAssets).returning({ id: assets.id }).all();
    const f = roads.length ? tx.insert(features).values(roads).returning({ id: features.id }).all() : [];
    return [...a, ...f].map((r) => r.id);
  });
  revalidatePath(`/seller/shops/${shopId}`);
  return { error: undefined, ids };
}

export async function updateAsset(shopId: string, assetId: string, _: FormState, f: FormData): Promise<FormState> {
  await ownShop(shopId);
  const code = s(f, "code");
  const price = Number(f.get("price"));
  if (!code) return { error: "กรอกรหัส/ชื่อ" };
  if (!Number.isFinite(price) || price < 0) return { error: "ราคาไม่ถูกต้อง" };
  const listed = f.get("listed") === "on";
  if (listed && price <= 0) return { error: "ตั้งราคาก่อนเปิดให้เช่า" };
  const dims = readDims(f);
  if (dims && "error" in dims) return dims;
  const a = await db.query.assets.findFirst({ where: and(eq(assets.id, assetId), eq(assets.shopId, shopId)), with: { floor: true } });
  if (!a) return { error: "ไม่พบรายการ" };
  // ขนาดจริง (เมตร) กำหนดขนาดกล่องบนผัง; ถ้าล้นขอบชั้นจะเลื่อนเข้ามาให้
  const d = defaultBox(0);
  const box = dims ? fit({ x: a.x ?? d.x, y: a.y ?? d.y, ...dims, rot: a.rot }, a.floor ?? CANVAS, MIN_ASSET_PX) : {};
  try {
    await db.update(assets).set({ code, size: s(f, "size") || null, note: s(f, "note") || null, price: Math.round(price), period: s(f, "period") === "DAY" ? "DAY" : "MONTH", listed, ...box })
      .where(eq(assets.id, a.id));
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
  const asset = await db.query.assets.findFirst({ where: eq(assets.id, assetId), with: { shop: true } });
  if (!asset || !asset.shop.active || !asset.shop.published) return { error: "ไม่พบรายการ" };
  if (!asset.listed || asset.price <= 0) return { error: "รายการนี้ยังไม่เปิดให้เช่า" };
  const start = new Date(s(f, "start"));
  const end = new Date(s(f, "end"));
  if (isNaN(+start) || isNaN(+end)) return { error: "เลือกวันที่เริ่มและวันสิ้นสุด" };
  const today = new Date(new Date().toDateString());
  if (+start < +today) return { error: "วันเริ่มต้องไม่ใช่วันที่ผ่านมาแล้ว" };
  if (+end <= +start) return { error: "วันสิ้นสุดต้องหลังวันเริ่ม" };
  if (await hasOverlap(assetId, start, end)) return { error: "ช่วงเวลานี้มีผู้เช่าแล้ว" };
  const b = s(f, "billing");
  const billing = b === "HALF_YEAR" || b === "YEAR" ? b : "MONTH";
  // สลิปงวดแรก (ไม่บังคับ)
  const slipFile = f.get("slip");
  let slip: string | null = null;
  if (slipFile instanceof File && slipFile.size) {
    const r = await storeSlip(slipFile);
    if ("error" in r) return r;
    slip = r.name;
  }
  await db.insert(leases).values({ assetId, tenantId: u.id, startDate: start, endDate: end, billing, slip });
  redirect("/tenant");
}

export async function cancelLease(leaseId: string) {
  const u = await requireUser();
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


/** ใช้แม่แบบผังสำเร็จรูป (สร้างทั้งโซน/ถนน/สิ่งอำนวยความสะดวก และรายการเช่าพร้อมราคาเริ่มต้นในคลิกเดียว) */
export async function applyTemplate(shopId: string, floorId: string, templateId: string) {
  const floor = await ownFloor(shopId, floorId);
  const tpl = FLOOR_TEMPLATES.find((t) => t.id === templateId);
  if (!tpl) return { error: "ไม่พบแม่แบบนี้", ids: [] as string[] };
  const existingCodes = new Set((await db.query.assets.findMany({ where: eq(assets.shopId, shopId), columns: { code: true } })).map((a) => a.code));
  const counters: Record<string, number> = {};
  const nextCode = (prefix: string) => {
    let n = (counters[prefix] ?? 0) + 1;
    while (existingCodes.has(prefix + String(n).padStart(2, "0"))) n++;
    counters[prefix] = n;
    const c = prefix + String(n).padStart(2, "0");
    existingCodes.add(c);
    return c;
  };
  const yOff = (await floorBottom(floorId)) > 0 ? snap((await floorBottom(floorId)) + 30) : 0;
  const needW = Math.max(floor.w, tpl.w);
  const needH = Math.min(CANVAS.maxH, Math.max(floor.h, yOff + tpl.h));

  const newFeats: (typeof features.$inferInsert)[] = tpl.features.map((f) => ({
    shopId,
    floorId,
    kind: f.kind,
    label: f.label ?? null,
    color: f.color ?? null,
    ...fit({ x: f.x, y: f.y + yOff, w: f.w, h: f.h, rot: f.rot ?? 0 }, { w: needW, h: needH }, 10),
  }));

  const newAssets: (typeof assets.$inferInsert)[] = tpl.assets.map((a) => ({
    shopId,
    floorId,
    code: nextCode(a.prefix),
    size: a.size,
    price: a.price,
    period: a.period,
    listed: a.price > 0,
    shape: a.shape ?? "RECT",
    ...fit({ x: a.x, y: a.y + yOff, w: a.w, h: a.h, rot: a.rot ?? 0 }, { w: needW, h: needH }, MIN_ASSET_PX),
  }));

  const ids = db.transaction((tx) => {
    if (needW > floor.w || needH > floor.h) {
      tx.update(floors).set({ w: needW, h: needH }).where(eq(floors.id, floorId)).run();
    }
    const fRows = newFeats.length ? tx.insert(features).values(newFeats).returning({ id: features.id }).all() : [];
    const aRows = newAssets.length ? tx.insert(assets).values(newAssets).returning({ id: assets.id }).all() : [];
    return [...fRows, ...aRows].map((r) => r.id);
  });

  revalidatePath(`/seller/shops/${shopId}`);
  return { error: undefined, ids };
}


/* ---------- แก้ไขข้อมูลร้าน / ลบร้าน / บันทึกผู้เช่าหน้าร้าน (Walk-in) ---------- */
export async function updateShop(shopId: string, _: FormState, f: FormData): Promise<FormState> {
  const shop = await ownShop(shopId);
  const name = s(f, "name");
  const category = s(f, "category") as keyof typeof CATEGORIES;
  if (name.length < 2) return { error: "กรอกชื่อร้านอย่างน้อย 2 ตัวอักษร" };
  if (!(category in CATEGORIES)) return { error: "เลือกประเภทธุรกิจ" };

  let coverPhoto = shop.coverPhoto;
  const cover = f.get("cover");
  if (cover instanceof File && cover.size > 0) {
    if (cover.size > MAX_BYTES) return { error: "รูปหน้าร้านต้องไม่เกิน 5MB" };
    const data = new Uint8Array(await cover.arrayBuffer());
    const kind = sniffImage(data);
    if (!kind) return { error: "รองรับเฉพาะไฟล์รูป JPG, PNG, WEBP, GIF" };
    if (shop.coverPhoto) await removePhotoFile(shop.coverPhoto);
    coverPhoto = `${crypto.randomUUID()}.${kind.ext}`;
    await savePhotoFile(coverPhoto, data);
  }

  await db
    .update(shops)
    .set({
      name,
      category,
      location: s(f, "location") || null,
      mapUrl: s(f, "mapUrl") || null,
      coverPhoto,
      phone: s(f, "phone") || null,
      description: s(f, "description") || null,
    })
    .where(eq(shops.id, shopId));
  revalidatePath("/", "layout");
  return { error: undefined, ids: ["saved"] };
}

/** บันทึกช่องทางรับเงิน: บัญชีธนาคาร / พร้อมเพย์ / รูป QR (อย่างน้อย 1 ทาง) */
export async function savePaymentInfo(shopId: string, _: FormState, f: FormData): Promise<FormState> {
  const shop = await ownShop(shopId);
  const bank = s(f, "payBank").slice(0, 60);
  const accountNo = s(f, "payAccountNo").replace(/[^\d-]/g, "").slice(0, 30);
  const accountName = s(f, "payAccountName").slice(0, 100);
  const promptpay = s(f, "payPromptpay").replace(/\D/g, "");
  const note = s(f, "payNote").slice(0, 300);
  if ((bank || accountNo || accountName) && !(bank && accountNo && accountName)) return { error: "กรอกธนาคาร เลขบัญชี และชื่อบัญชีให้ครบ" };
  if (accountNo && accountNo.replace(/\D/g, "").length < 10) return { error: "เลขบัญชีต้องมีอย่างน้อย 10 หลัก" };
  if (promptpay && promptpay.length !== 10 && promptpay.length !== 13) return { error: "พร้อมเพย์ต้องเป็นเบอร์มือถือ 10 หลัก หรือเลขบัตรประชาชน 13 หลัก" };

  let qr = shop.payQr;
  const file = f.get("payQrFile");
  if (file instanceof File && file.size) {
    if (file.size > MAX_BYTES) return { error: "รูป QR ใหญ่เกิน 5MB" };
    const data = new Uint8Array(await file.arrayBuffer());
    const kind = sniffImage(data);
    if (!kind) return { error: "รูป QR รองรับเฉพาะ JPG, PNG, WEBP, GIF" };
    if (qr) await removePhotoFile(qr);
    qr = `${crypto.randomUUID()}.${kind.ext}`;
    await savePhotoFile(qr, data);
  } else if (f.get("removeQr") === "on" && qr) {
    await removePhotoFile(qr);
    qr = null;
  }
  const info = { payBank: bank || null, payAccountNo: accountNo || null, payAccountName: accountName || null, payPromptpay: promptpay || null, payQr: qr, payNote: note || null };
  if (!hasPayInfo(info)) return { error: "ใส่ช่องทางรับเงินอย่างน้อย 1 ทาง: บัญชีธนาคาร พร้อมเพย์ หรือรูป QR" };
  await db.update(shops).set(info).where(eq(shops.id, shopId));
  revalidatePath("/", "layout");
  return { error: undefined };
}

/* ---------- สลิปโอนเงิน ---------- */
async function storeSlip(file: File): Promise<{ name: string } | { error: string }> {
  if (file.size > MAX_BYTES) return { error: "รูปสลิปใหญ่เกิน 5MB" };
  const data = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(data);
  if (!kind) return { error: "สลิปต้องเป็นรูป JPG, PNG, WEBP หรือ GIF" };
  const name = `${crypto.randomUUID()}.${kind.ext}`;
  await savePhotoFile(name, data);
  return { name };
}

/** ผู้เช่าแนบสลิปของงวดที่ยังไม่ชำระ (แนบใหม่ = แทนที่สลิปเดิม) */
export async function uploadPaymentSlip(paymentId: string, f: FormData): Promise<FormState> {
  const u = await requireUser();
  const pay = await db.query.payments.findFirst({ where: eq(payments.id, paymentId), with: { lease: true } });
  if (!pay || pay.lease.tenantId !== u.id) return { error: "ไม่พบงวดชำระนี้" };
  if (pay.paidAt) return { error: "งวดนี้ยืนยันรับเงินแล้ว" };
  const file = f.get("file");
  if (!(file instanceof File) || !file.size) return { error: "เลือกรูปสลิปก่อน" };
  const r = await storeSlip(file);
  if ("error" in r) return r;
  // สลิปเดิมลบได้เฉพาะเมื่อไม่ได้ใช้ร่วมกับคำขอเช่า
  if (pay.slip && pay.slip !== pay.lease.slip) await removePhotoFile(pay.slip);
  await db.update(payments).set({ slip: r.name, slipAt: new Date() }).where(eq(payments.id, paymentId));
  revalidatePath("/tenant");
  revalidatePath("/seller", "layout");
  return { error: undefined };
}

export async function uploadShopCover(shopId: string, f: FormData): Promise<FormState> {
  const shop = await ownShop(shopId);
  const file = f.get("file");
  if (!(file instanceof File) || !file.size) return { error: "ไม่พบไฟล์รูป" };
  if (file.size > MAX_BYTES) return { error: "ไฟล์ใหญ่เกิน 5MB" };
  const data = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(data);
  if (!kind) return { error: "รองรับเฉพาะ JPG, PNG, WEBP, GIF" };
  if (shop.coverPhoto) await removePhotoFile(shop.coverPhoto);
  const name = `${crypto.randomUUID()}.${kind.ext}`;
  await savePhotoFile(name, data);
  await db.update(shops).set({ coverPhoto: name }).where(eq(shops.id, shopId));
  revalidatePath("/", "layout");
  return { error: undefined };
}

export async function deleteShopCover(shopId: string) {
  const shop = await ownShop(shopId);
  if (shop.coverPhoto) {
    await removePhotoFile(shop.coverPhoto);
    await db.update(shops).set({ coverPhoto: null }).where(eq(shops.id, shopId));
    revalidatePath("/", "layout");
  }
}

export async function deleteShop(shopId: string): Promise<FormState> {
  await ownShop(shopId);
  const shopAssets = await db.query.assets.findMany({ where: eq(assets.shopId, shopId), with: { leases: true } });
  const hasActive = shopAssets.some((a) => a.leases.some((l) => l.status === "ACTIVE"));
  if (hasActive) return { error: "ไม่สามารถลบร้านได้เนื่องจากยังมีสัญญาเช่าที่กำลังใช้งานอยู่ (กดจบสัญญาก่อนลบร้าน)" };
  await removePhotoFilesOf(shopAssets.map((a) => a.id));
  await db.delete(shops).where(eq(shops.id, shopId));
  revalidatePath("/", "layout");
  redirect("/seller");
}

export async function createWalkInLease(shopId: string, _: FormState, f: FormData): Promise<FormState> {
  await ownShop(shopId);
  const u = await requireUser();
  const assetId = s(f, "assetId");
  const guestName = s(f, "guestName");
  const guestPhone = s(f, "guestPhone") || null;
  if (!assetId) return { error: "เลือกรายการที่ต้องการลงผู้เช่า" };
  if (guestName.length < 2) return { error: "กรอกชื่อผู้เช่าอย่างน้อย 2 ตัวอักษร" };

  const asset = await db.query.assets.findFirst({ where: and(eq(assets.id, assetId), eq(assets.shopId, shopId)) });
  if (!asset) return { error: "ไม่พบรายการเช่านี้ในร้าน" };
  if (asset.price <= 0) return { error: "กรุณาตั้งราคาของรายการนี้ก่อนลงสัญญาเช่า" };

  const start = new Date(s(f, "start"));
  const end = new Date(s(f, "end"));
  if (isNaN(+start) || isNaN(+end)) return { error: "เลือกวันที่เริ่มและวันสิ้นสุด" };
  if (+end <= +start) return { error: "วันสิ้นสุดต้องหลังวันเริ่ม" };
  if (await hasOverlap(asset.id, start, end)) return { error: "ช่วงเวลานี้มีสัญญาเช่าที่ใช้งานอยู่แล้ว" };

  const b = s(f, "billing");
  const billing = b === "HALF_YEAR" || b === "YEAR" ? b : "MONTH";
  const paidFirst = f.get("paidFirst") === "on";

  const [lease] = await db
    .insert(leases)
    .values({
      assetId: asset.id,
      tenantId: u.id,
      guestName,
      guestPhone,
      status: "ACTIVE",
      startDate: start,
      endDate: end,
      billing,
    })
    .returning();

  const rows = buildPayments({ price: asset.price, period: asset.period, start, end, billing });
  if (rows.length) {
    await db.insert(payments).values(
      rows.map((r, i) => ({
        ...r,
        leaseId: lease.id,
        paidAt: paidFirst && i === 0 ? new Date() : null,
      })),
    );
  }

  revalidatePath("/", "layout");
  return { error: undefined, ids: [lease.id] };
}
