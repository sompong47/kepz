import bcrypt from "bcryptjs";
import { db, users, shops, assets, leases, payments } from "./index";
import { buildPayments } from "../lib/domain";

async function main() {
  const pw = await bcrypt.hash("password123", 10);
  const [admin, seller, tenant, tenant2] = await db
    .insert(users)
    .values([
      { name: "แอดมิน", email: "admin@kepz.test", password: pw, role: "ADMIN" },
      { name: "คุณสมชาย (ผู้ขาย)", email: "seller@kepz.test", password: pw, role: "SELLER", phone: "081-111-1111" },
      { name: "คุณมานี (ผู้เช่า)", email: "tenant@kepz.test", password: pw, role: "TENANT", phone: "082-222-2222" },
      { name: "คุณวีระ (ผู้เช่า)", email: "tenant2@kepz.test", password: pw, role: "TENANT" },
    ])
    .onConflictDoNothing()
    .returning();
  if (!admin) return console.log("seed ข้ามเพราะมีข้อมูลแล้ว");

  const [kepz, park, boat] = await db
    .insert(shops)
    .values([
      { name: "kepz Storage", category: "STORAGE", location: "ลาดพร้าว กรุงเทพฯ", description: "ห้องเก็บของปลอดภัย CCTV 24 ชม. ขนาด XS–L", ownerId: seller.id },
      { name: "จอดสบาย", category: "PARKING", location: "สุขุมวิท 22", description: "ที่จอดรถรายเดือน ใกล้ BTS", ownerId: seller.id },
      { name: "เรือเช่าเกาะเสม็ด", category: "BOAT", location: "ระยอง", description: "เรือสปีดโบ๊ท เช่ารายวัน", ownerId: seller.id },
    ])
    .returning();

  const sizes = [["XS", 800], ["S", 1200], ["M", 1800], ["L", 2800]] as const;
  const rows = Array.from({ length: 12 }, (_, i) => {
    const [size, price] = sizes[i % 4];
    return { shopId: kepz.id, code: `A${String(i + 1).padStart(2, "0")}`, size, price, period: "MONTH" as const };
  });
  const created = await db.insert(assets).values(rows).returning();
  const p1 = await db.insert(assets).values([{ shopId: park.id, code: "P01", size: "รถเก๋ง", price: 2500, period: "MONTH" }, { shopId: park.id, code: "P02", size: "รถเก๋ง", price: 2500, period: "MONTH" }]).returning();
  await db.insert(assets).values([{ shopId: boat.id, code: "สปีดโบ๊ท 1", size: "10 ที่นั่ง", price: 6000, period: "DAY" }]);

  const now = Date.now();
  const D = 86400000;
  const mk = async (asset: typeof created[number], tenantId: string, startOff: number, endOff: number) => {
    const start = new Date(now + startOff * D), end = new Date(now + endOff * D);
    const [l] = await db.insert(leases).values({ assetId: asset.id, tenantId, startDate: start, endDate: end, status: "ACTIVE", billing: "MONTH" }).returning();
    const pays = buildPayments({ price: asset.price, period: "MONTH", start, end, billing: "MONTH" });
    await db.insert(payments).values(pays.map((p) => ({ ...p, leaseId: l.id, paidAt: +p.dueDate < now - 5 * D ? p.dueDate : null })));
  };
  await mk(created[0], tenant.id, -60, 300);
  await mk(created[1], tenant2.id, -20, 15); // ใกล้หมดสัญญา
  await mk(created[2], tenant2.id, -100, 260);
  await mk(p1[0], tenant.id, -30, 335);
  await db.insert(leases).values({ assetId: created[4].id, tenantId: tenant.id, startDate: new Date(now + 3 * D), endDate: new Date(now + 190 * D), billing: "HALF_YEAR" });
  console.log("seed สำเร็จ\n  admin@kepz.test / seller@kepz.test / tenant@kepz.test  รหัสผ่าน: password123");
}
main();
