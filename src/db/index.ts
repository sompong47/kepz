import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, asc, eq, isNull } from "drizzle-orm";
import * as schema from "./schema";
import { buildPayments, FLOOR_TEMPLATES } from "@/lib/domain";

const DDL = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT, password TEXT NOT NULL, role TEXT NOT NULL, created_at INTEGER);
CREATE TABLE IF NOT EXISTS shops (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, category TEXT NOT NULL, location TEXT, map_url TEXT, cover_photo TEXT, phone TEXT, active INTEGER NOT NULL DEFAULT 1, owner_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER);
CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, code TEXT NOT NULL, size TEXT, price INTEGER NOT NULL, period TEXT NOT NULL DEFAULT 'MONTH', note TEXT, shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE);
CREATE UNIQUE INDEX IF NOT EXISTS assets_shop_code ON assets(shop_id, code);
CREATE TABLE IF NOT EXISTS leases (id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'PENDING', start_date INTEGER NOT NULL, end_date INTEGER NOT NULL, billing TEXT NOT NULL DEFAULT 'MONTH', asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE, tenant_id TEXT NOT NULL REFERENCES users(id), guest_name TEXT, guest_phone TEXT, created_at INTEGER);
CREATE TABLE IF NOT EXISTS floors (id TEXT PRIMARY KEY, name TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0, w INTEGER NOT NULL DEFAULT 1000, h INTEGER NOT NULL DEFAULT 600, shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS features (id TEXT PRIMARY KEY, kind TEXT NOT NULL, label TEXT, x INTEGER NOT NULL, y INTEGER NOT NULL, w INTEGER NOT NULL, h INTEGER NOT NULL, rot INTEGER NOT NULL DEFAULT 0, color TEXT, floor_id TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE, shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS asset_photos (id TEXT PRIMARY KEY, file TEXT NOT NULL, mime TEXT NOT NULL, asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE, created_at INTEGER);
CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, amount INTEGER NOT NULL, due_date INTEGER NOT NULL, paid_at INTEGER, lease_id TEXT NOT NULL REFERENCES leases(id) ON DELETE CASCADE);
`;

// เพิ่มเลขนี้เมื่อแก้ DDL/migrate เพื่อให้ dev server ที่เปิดค้างไว้รัน migrate ซ้ำ
const SCHEMA_VERSION = 12;
const g = globalThis as unknown as { _sqlite?: Database.Database; _db?: ReturnType<typeof drizzle<typeof schema>>; _schemaVersion?: number };

function migrate(sqlite: Database.Database) {
  sqlite.exec(DDL);
  // migrate: เพิ่มคอลัมน์ผังให้ฐานข้อมูลเก่า
  const cols = (sqlite.prepare("PRAGMA table_info(assets)").all() as { name: string }[]).map((c) => c.name);
  for (const [c, def] of [["x", "INTEGER"], ["y", "INTEGER"], ["w", "INTEGER"], ["h", "INTEGER"], ["shape", "TEXT NOT NULL DEFAULT 'RECT'"], ["floor_id", "TEXT REFERENCES floors(id) ON DELETE SET NULL"], ["rot", "INTEGER NOT NULL DEFAULT 0"]])
    if (!cols.includes(c)) sqlite.exec(`ALTER TABLE assets ADD COLUMN ${c} ${def}`);
  // migrate: ธงเปิดให้เช่า; ของเดิมที่ตั้งราคาแล้วถือว่าเปิดอยู่ (เหมือนพฤติกรรมเดิม)
  if (!cols.includes("listed")) {
    sqlite.exec("ALTER TABLE assets ADD COLUMN listed INTEGER NOT NULL DEFAULT 0");
    sqlite.exec("UPDATE assets SET listed = 1 WHERE price > 0");
  }
  // migrate: สถานะร้าน (ฉบับร่าง/เปิดให้เช่า) + รูปหน้าร้านจริง + ลิงก์ Google Maps
  const scols = (sqlite.prepare("PRAGMA table_info(shops)").all() as { name: string }[]).map((c) => c.name);
  if (!scols.includes("published")) {
    sqlite.exec("ALTER TABLE shops ADD COLUMN published INTEGER NOT NULL DEFAULT 1");
    sqlite.exec("UPDATE shops SET published = 0 WHERE id NOT IN (SELECT shop_id FROM assets WHERE listed = 1)");
  }
  if (!scols.includes("map_url")) sqlite.exec("ALTER TABLE shops ADD COLUMN map_url TEXT");
  if (!scols.includes("cover_photo")) sqlite.exec("ALTER TABLE shops ADD COLUMN cover_photo TEXT");
  // migrate: ช่องทางรับเงินของร้าน (บัญชีธนาคาร / พร้อมเพย์ / รูป QR)
  for (const c of ["pay_bank", "pay_account_no", "pay_account_name", "pay_promptpay", "pay_qr", "pay_note"])
    if (!scols.includes(c)) sqlite.exec(`ALTER TABLE shops ADD COLUMN ${c} TEXT`);

  const fcols = (sqlite.prepare("PRAGMA table_info(features)").all() as { name: string }[]).map((c) => c.name);
  if (!fcols.includes("rot")) sqlite.exec("ALTER TABLE features ADD COLUMN rot INTEGER NOT NULL DEFAULT 0");
  if (!fcols.includes("color")) sqlite.exec("ALTER TABLE features ADD COLUMN color TEXT");
  const lcols = (sqlite.prepare("PRAGMA table_info(leases)").all() as { name: string }[]).map((c) => c.name);
  if (!lcols.includes("guest_name")) sqlite.exec("ALTER TABLE leases ADD COLUMN guest_name TEXT");
  if (!lcols.includes("guest_phone")) sqlite.exec("ALTER TABLE leases ADD COLUMN guest_phone TEXT");
  // migrate: สลิปโอนเงิน (แนบตอนขอเช่า = งวดแรก, และแนบรายงวด)
  if (!lcols.includes("slip")) sqlite.exec("ALTER TABLE leases ADD COLUMN slip TEXT");
  const pcols = (sqlite.prepare("PRAGMA table_info(payments)").all() as { name: string }[]).map((c) => c.name);
  if (!pcols.includes("slip")) sqlite.exec("ALTER TABLE payments ADD COLUMN slip TEXT");
  if (!pcols.includes("slip_at")) sqlite.exec("ALTER TABLE payments ADD COLUMN slip_at INTEGER");
  // migrate: ร้านที่ยังไม่มีชั้น ให้สร้าง "ชั้น 1" แล้วย้ายรายการเดิมเข้าไป
  const noFloor = sqlite.prepare("SELECT id FROM shops WHERE id NOT IN (SELECT shop_id FROM floors)").all() as { id: string }[];
  for (const { id } of noFloor) {
    const fid = crypto.randomUUID();
    sqlite.prepare("INSERT INTO floors (id, name, sort, shop_id) VALUES (?, 'ชั้น 1', 0, ?)").run(fid, id);
    sqlite.prepare("UPDATE assets SET floor_id = ? WHERE shop_id = ? AND floor_id IS NULL").run(fid, id);
  }
}

/** สร้างข้อมูลตัวอย่าง (Demo Seed) อัตโนมัติหากฐานข้อมูลยังว่างอยู่ (เหมาะสำหรับ Deploy บน Vercel / Demo) */
function autoSeedIfEmpty(sqlite: Database.Database, d: ReturnType<typeof drizzle<typeof schema>>) {
  const count = (sqlite.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number }).c;
  if (count > 0) return;

  const pw = bcrypt.hashSync("password123", 10);
  const [admin, seller, tenant, tenant2] = d
    .insert(schema.users)
    .values([
      { id: "demo-admin", name: "แอดมิน (Demo)", email: "admin@kepz.test", password: pw, role: "ADMIN" },
      { id: "demo-seller", name: "คุณสมชาย (เจ้าของร้าน)", email: "seller@kepz.test", password: pw, role: "SELLER", phone: "081-111-1111" },
      { id: "demo-tenant", name: "คุณมานี (ผู้เช่า)", email: "tenant@kepz.test", password: pw, role: "TENANT", phone: "082-222-2222" },
      { id: "demo-tenant-2", name: "คุณวีระ (ผู้เช่า)", email: "tenant2@kepz.test", password: pw, role: "TENANT", phone: "089-999-9999" },
    ])
    .returning()
    .all();

  if (!admin || !seller || !tenant || !tenant2) return;

  const demoShops = [
    {
      id: "shop-storage-1",
      name: "kepz Self-Storage ลาดพร้าว",
      category: "STORAGE" as const,
      location: "ลาดพร้าว 71 กรุงเทพฯ",
      description: "ห้องเก็บของส่วนตัวติดแอร์ เข้า-ออกได้ 24 ชม. ด้วยระบบคีย์การ์ด มีกล้องวงจรปิด CCTV ทุกซอย และลิฟต์ขนของขนาดใหญ่",
      phone: "081-111-1111",
      tplId: "storage-standard",
    },
    {
      id: "shop-parking-1",
      name: "จอดสบาย สุขุมวิท 22 (ใกล้ BTS พร้อมพงษ์)",
      category: "PARKING" as const,
      location: "สุขุมวิท 22 กรุงเทพฯ",
      description: "ลานจอดรถรายเดือนในร่มและกลางแจ้ง มีป้อมยามดูแลตลอด 24 ชม. เดินไป BTS พร้อมพงษ์เพียง 350 เมตร",
      phone: "081-222-3333",
      tplId: "parking-lot",
    },
    {
      id: "shop-stall-1",
      name: "ตลาดนัดกรีนพลาซ่า รามอินทรา",
      category: "STALL" as const,
      location: "รามอินทรา กม.8 กรุงเทพฯ",
      description: "ตลาดนัดเย็นคนเดินแน่นทุกวัน แบ่งโซนอาหารและโซนแฟชั่นชัดเจน มีลานนั่งทานอาหารและดนตรีสด",
      phone: "089-444-5555",
      tplId: "market-plaza",
    },
    {
      id: "shop-boat-1",
      name: "บ้านเพ มารีน่า & สปีดโบ๊ทเกาะเสม็ด",
      category: "BOAT" as const,
      location: "ท่าเรือบ้านเพ ระยอง",
      description: "บริการเช่าเรือสปีดโบ๊ทและเรือยอชต์เหมาลำข้ามไปเกาะเสม็ด พร้อมกัปตันและเสื้อชูชีพครบ",
      phone: "086-777-8888",
      tplId: "boat-marina",
    },
  ];

  const createdAssetsByShop: Record<string, (typeof schema.assets.$inferSelect)[]> = {};

  for (const s of demoShops) {
    const [shop] = d
      .insert(schema.shops)
      .values({
        id: s.id,
        name: s.name,
        category: s.category,
        location: s.location,
        description: s.description,
        phone: s.phone,
        ownerId: seller.id,
        published: true,
        active: true,
      })
      .returning()
      .all();

    const tpl = FLOOR_TEMPLATES.find((t) => t.id === s.tplId);
    const [floor] = d
      .insert(schema.floors)
      .values({
        shopId: shop.id,
        name: "ชั้น 1 / ผังหลัก",
        sort: 0,
        w: tpl?.w ?? 1000,
        h: tpl?.h ?? 600,
      })
      .returning()
      .all();

    if (tpl) {
      if (tpl.features.length) {
        d.insert(schema.features)
          .values(
            tpl.features.map((f) => ({
              shopId: shop.id,
              floorId: floor.id,
              kind: f.kind,
              label: f.label ?? null,
              color: f.color ?? null,
              x: f.x,
              y: f.y,
              w: f.w,
              h: f.h,
              rot: f.rot ?? 0,
            })),
          )
          .run();
      }
      const counters: Record<string, number> = {};
      const nextCode = (prefix: string) => {
        const n = (counters[prefix] ?? 0) + 1;
        counters[prefix] = n;
        return prefix + String(n).padStart(2, "0");
      };
      if (tpl.assets.length) {
        createdAssetsByShop[shop.id] = d
          .insert(schema.assets)
          .values(
            tpl.assets.map((a) => ({
              shopId: shop.id,
              floorId: floor.id,
              code: nextCode(a.prefix),
              size: a.size,
              price: a.price,
              period: a.period,
              listed: true,
              shape: a.shape ?? "RECT",
              x: a.x,
              y: a.y,
              w: a.w,
              h: a.h,
              rot: a.rot ?? 0,
            })),
          )
          .returning()
          .all();
      }
    }
  }

  // สร้างสัญญาเช่าและบิลตัวอย่างเพื่อให้เห็นสถานะ ว่าง / มีผู้เช่า / ใกล้หมดสัญญา / รออนุมัติ ครบทุกแบบ
  const now = Date.now();
  const D = 86400000;
  const storageAssets = createdAssetsByShop["shop-storage-1"] ?? [];
  const parkingAssets = createdAssetsByShop["shop-parking-1"] ?? [];

  const mkLease = (asset: (typeof schema.assets.$inferSelect) | undefined, tenantId: string, startOff: number, endOff: number, status: "ACTIVE" | "PENDING" = "ACTIVE") => {
    if (!asset) return;
    const start = new Date(now + startOff * D);
    const end = new Date(now + endOff * D);
    const [l] = d
      .insert(schema.leases)
      .values({ assetId: asset.id, tenantId, startDate: start, endDate: end, status, billing: "MONTH" })
      .returning()
      .all();
    if (status === "ACTIVE") {
      const pays = buildPayments({ price: asset.price, period: asset.period, start, end, billing: "MONTH" });
      if (pays.length) {
        d.insert(schema.payments)
          .values(pays.map((p) => ({ ...p, leaseId: l.id, paidAt: +p.dueDate < now - 5 * D ? p.dueDate : null })))
          .run();
      }
    }
  };

  mkLease(storageAssets[0], tenant.id, -60, 240, "ACTIVE"); // กำลังเช่า
  mkLease(storageAssets[1], tenant2.id, -20, 14, "ACTIVE"); // ใกล้หมดสัญญา (สีส้ม)
  mkLease(storageAssets[6], tenant2.id, -90, 180, "ACTIVE"); // กำลังเช่า
  mkLease(storageAssets[12], tenant.id, 3, 185, "PENDING"); // รออนุมัติ (สีฟ้า)
  mkLease(parkingAssets[0], tenant.id, -30, 335, "ACTIVE");
  mkLease(parkingAssets[1], tenant2.id, -15, 20, "ACTIVE");
}

function openSqlite(): Database.Database {
  // 1) ถ้าตั้งค่า DB_FILE ไว้ หรือรันในเครื่อง Local ให้ลองเปิดไฟล์ปกติก่อน
  const candidates = process.env.DB_FILE
    ? [process.env.DB_FILE]
    : process.env.VERCEL
      ? [path.join(os.tmpdir(), "kepz-demo.db")]
      : ["kepz.db", path.join(os.tmpdir(), "kepz-demo.db")];

  for (const file of candidates) {
    try {
      const dbInstance = new Database(file);
      try {
        dbInstance.pragma("journal_mode = WAL");
      } catch {
        // บาง filesystem เช่น /tmp บน serverless อาจไม่รองรับ WAL ให้ใช้โหมดปกติแทน
      }
      return dbInstance;
    } catch {
      // ถ้าเปิดไฟล์ไม่ได้ (เช่น Read-only filesystem บน Vercel) ให้ลองตัวถัดไป
    }
  }

  // 2) Fallback สุดท้าย: ใช้ In-Memory Database (:memory:) รับประกันว่าเปิดได้ 100% บนทุก Serverless
  return new Database(":memory:");
}

if (!g._sqlite) {
  g._sqlite = openSqlite();
}
if (g._schemaVersion !== SCHEMA_VERSION) {
  migrate(g._sqlite);
  g._schemaVersion = SCHEMA_VERSION;
  g._db = drizzle(g._sqlite, { schema });
  autoSeedIfEmpty(g._sqlite, g._db);
}
export const db = g._db!;
export * from "./schema";

/** คืนรายการชั้นของร้าน (เรียงตามลำดับ); ถ้ายังไม่มีจะสร้าง "ชั้น 1" และย้ายรายการที่ยังไม่มีชั้นเข้าไป */
export async function floorsOf(shopId: string) {
  let rows = await db.query.floors.findMany({ where: eq(schema.floors.shopId, shopId), orderBy: asc(schema.floors.sort) });
  if (!rows.length) {
    rows = await db.insert(schema.floors).values({ shopId, name: "ชั้น 1", sort: 0 }).returning();
  }
  await db.update(schema.assets).set({ floorId: rows[0].id }).where(and(eq(schema.assets.shopId, shopId), isNull(schema.assets.floorId)));
  return rows;
}
