import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, asc, eq, isNull } from "drizzle-orm";
import * as schema from "./schema";

const DDL = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT, password TEXT NOT NULL, role TEXT NOT NULL, created_at INTEGER);
CREATE TABLE IF NOT EXISTS shops (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, category TEXT NOT NULL, location TEXT, phone TEXT, active INTEGER NOT NULL DEFAULT 1, owner_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER);
CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, code TEXT NOT NULL, size TEXT, price INTEGER NOT NULL, period TEXT NOT NULL DEFAULT 'MONTH', note TEXT, shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE);
CREATE UNIQUE INDEX IF NOT EXISTS assets_shop_code ON assets(shop_id, code);
CREATE TABLE IF NOT EXISTS leases (id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'PENDING', start_date INTEGER NOT NULL, end_date INTEGER NOT NULL, billing TEXT NOT NULL DEFAULT 'MONTH', asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE, tenant_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER);
CREATE TABLE IF NOT EXISTS floors (id TEXT PRIMARY KEY, name TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0, w INTEGER NOT NULL DEFAULT 1000, h INTEGER NOT NULL DEFAULT 600, shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS features (id TEXT PRIMARY KEY, kind TEXT NOT NULL, label TEXT, x INTEGER NOT NULL, y INTEGER NOT NULL, w INTEGER NOT NULL, h INTEGER NOT NULL, rot INTEGER NOT NULL DEFAULT 0, floor_id TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE, shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS asset_photos (id TEXT PRIMARY KEY, file TEXT NOT NULL, mime TEXT NOT NULL, asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE, created_at INTEGER);
CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, amount INTEGER NOT NULL, due_date INTEGER NOT NULL, paid_at INTEGER, lease_id TEXT NOT NULL REFERENCES leases(id) ON DELETE CASCADE);
`;

// เพิ่มเลขนี้เมื่อแก้ DDL/migrate เพื่อให้ dev server ที่เปิดค้างไว้รัน migrate ซ้ำ
const SCHEMA_VERSION = 4;
const g = globalThis as unknown as { _sqlite?: Database.Database; _db?: ReturnType<typeof drizzle<typeof schema>>; _schemaVersion?: number };

function migrate(sqlite: Database.Database) {
  sqlite.exec(DDL);
  // migrate: เพิ่มคอลัมน์ผังให้ฐานข้อมูลเก่า
  const cols = (sqlite.prepare("PRAGMA table_info(assets)").all() as { name: string }[]).map((c) => c.name);
  for (const [c, def] of [["x", "INTEGER"], ["y", "INTEGER"], ["w", "INTEGER"], ["h", "INTEGER"], ["shape", "TEXT NOT NULL DEFAULT 'RECT'"], ["floor_id", "TEXT REFERENCES floors(id) ON DELETE SET NULL"], ["rot", "INTEGER NOT NULL DEFAULT 0"]])
    if (!cols.includes(c)) sqlite.exec(`ALTER TABLE assets ADD COLUMN ${c} ${def}`);
  const fcols = (sqlite.prepare("PRAGMA table_info(features)").all() as { name: string }[]).map((c) => c.name);
  if (!fcols.includes("rot")) sqlite.exec("ALTER TABLE features ADD COLUMN rot INTEGER NOT NULL DEFAULT 0");
  // migrate: ร้านที่ยังไม่มีชั้น ให้สร้าง "ชั้น 1" แล้วย้ายรายการเดิมเข้าไป
  const noFloor = sqlite.prepare("SELECT id FROM shops WHERE id NOT IN (SELECT shop_id FROM floors)").all() as { id: string }[];
  for (const { id } of noFloor) {
    const fid = crypto.randomUUID();
    sqlite.prepare("INSERT INTO floors (id, name, sort, shop_id) VALUES (?, 'ชั้น 1', 0, ?)").run(fid, id);
    sqlite.prepare("UPDATE assets SET floor_id = ? WHERE shop_id = ? AND floor_id IS NULL").run(fid, id);
  }
}

if (!g._sqlite) {
  g._sqlite = new Database(process.env.DB_FILE ?? "kepz.db");
  g._sqlite.pragma("journal_mode = WAL");
}
if (g._schemaVersion !== SCHEMA_VERSION) {
  migrate(g._sqlite);
  g._schemaVersion = SCHEMA_VERSION;
  g._db = drizzle(g._sqlite, { schema });
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
