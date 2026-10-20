import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const DDL = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT, password TEXT NOT NULL, role TEXT NOT NULL, created_at INTEGER);
CREATE TABLE IF NOT EXISTS shops (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, category TEXT NOT NULL, location TEXT, phone TEXT, active INTEGER NOT NULL DEFAULT 1, owner_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER);
CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, code TEXT NOT NULL, size TEXT, price INTEGER NOT NULL, period TEXT NOT NULL DEFAULT 'MONTH', note TEXT, shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE);
CREATE UNIQUE INDEX IF NOT EXISTS assets_shop_code ON assets(shop_id, code);
CREATE TABLE IF NOT EXISTS leases (id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'PENDING', start_date INTEGER NOT NULL, end_date INTEGER NOT NULL, billing TEXT NOT NULL DEFAULT 'MONTH', asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE, tenant_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER);
CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, amount INTEGER NOT NULL, due_date INTEGER NOT NULL, paid_at INTEGER, lease_id TEXT NOT NULL REFERENCES leases(id) ON DELETE CASCADE);
`;

const g = globalThis as unknown as { _db?: ReturnType<typeof create> };
function create() {
  const sqlite = new Database(process.env.DB_FILE ?? "kepz.db");
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(DDL);
  // migrate: เพิ่มคอลัมน์ผังให้ฐานข้อมูลเก่า
  const cols = (sqlite.prepare("PRAGMA table_info(assets)").all() as { name: string }[]).map((c) => c.name);
  for (const [c, def] of [["x", "INTEGER"], ["y", "INTEGER"], ["w", "INTEGER"], ["h", "INTEGER"], ["shape", "TEXT NOT NULL DEFAULT 'RECT'"]])
    if (!cols.includes(c)) sqlite.exec(`ALTER TABLE assets ADD COLUMN ${c} ${def}`);
  return drizzle(sqlite, { schema });
}
export const db = (g._db ??= create());
export * from "./schema";
