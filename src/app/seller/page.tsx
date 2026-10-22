import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, shops } from "@/db";
import { requireUser } from "@/lib/auth";
import { CATEGORIES, assetState, baht } from "@/lib/domain";
import { Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Seller() {
  const u = await requireUser();
  const my = await db.query.shops.findMany({
    where: eq(shops.ownerId, u.id),
    with: { assets: { with: { leases: { with: { payments: true } } } } },
  });
  const assets = my.flatMap((s) => s.assets);
  const states = assets.map((a) => assetState(a.leases));
  const pays = assets.flatMap((a) => a.leases.filter((l) => l.status === "ACTIVE").flatMap((l) => l.payments));
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const revenue = pays.filter((p) => p.paidAt && +p.paidAt >= monthStart).reduce((s, p) => s + p.amount, 0);
  const overdue = pays.filter((p) => !p.paidAt && +p.dueDate < Date.now()).length;
  const pending = assets.flatMap((a) => a.leases).filter((l) => l.status === "PENDING").length;
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">ร้านของฉัน</h1>
        <Link href="/seller/shops/new" className="btn">+ สร้างร้านใหม่</Link>
      </div>
      <div className="card">
        <div className="text-sm text-muted">รายได้ที่รับแล้วเดือนนี้</div>
        <div className="text-4xl font-extrabold mt-1">{baht(revenue)}</div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="มีผู้เช่า" value={states.filter((s) => s === "OCCUPIED" || s === "EXPIRING").length} />
        <Stat label="ว่าง" value={states.filter((s) => s === "VACANT").length} />
        <Stat label="เกินกำหนดชำระ" value={overdue} tone={overdue ? "warn" : undefined} />
        <Stat label="รอการอนุมัติ" value={pending} tone={pending ? "warn" : undefined} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {my.map((s) => (
          <Link key={s.id} href={`/seller/shops/${s.id}`} className="card hover:border-brand">
            <div className="text-2xl">{CATEGORIES[s.category].icon}</div>
            <div className="flex items-start justify-between gap-2">
              <div className="font-bold mt-1">{s.name}</div>
              <span className={`text-xs rounded-full px-2.5 py-1 shrink-0 ${!s.active ? "bg-danger/10 text-danger" : s.published ? "bg-ok/10 text-ok" : "bg-brand/20 text-ink2"}`}>
                {!s.active ? "ถูกระงับ" : s.published ? "● เปิดให้เช่า" : "ฉบับร่าง"}
              </span>
            </div>
            <div className="text-sm text-muted">{s.assets.length} {CATEGORIES[s.category].unit} · เปิดให้เช่า {s.assets.filter((a) => a.listed).length}</div>
            {s.active && !s.published && <div className="text-xs text-brand-ink mt-2">ยังไม่เปิดร้าน — เข้าไปตั้งราคาแล้วกด “เปิดร้านให้เช่า” →</div>}
          </Link>
        ))}
        {!my.length && <p className="text-muted">ยังไม่มีร้าน — กด “สร้างร้านใหม่” เพื่อเริ่มต้น</p>}
      </div>
    </div>
  );
}
