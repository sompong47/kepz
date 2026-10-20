import Link from "next/link";
import { db } from "@/db";
import { requireRole } from "@/lib/auth";
import { toggleShop } from "@/lib/actions";
import { CATEGORIES, baht } from "@/lib/domain";
import { Stat } from "@/components/ui";

export const dynamic = "force-dynamic";
const ROLE = { TENANT: "ผู้เช่า", SELLER: "ผู้ขาย", ADMIN: "แอดมิน" } as const;

export default async function Admin() {
  await requireRole("ADMIN");
  const [users, shops, leases, payments] = await Promise.all([
    db.query.users.findMany(),
    db.query.shops.findMany({ with: { owner: true, assets: true } }),
    db.query.leases.findMany(),
    db.query.payments.findMany(),
  ]);
  const paid = payments.filter((p) => p.paidAt).reduce((s, p) => s + p.amount, 0);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="ผู้ใช้ทั้งหมด" value={users.length} />
        <Stat label="ร้านทั้งหมด" value={shops.length} />
        <Stat label="สัญญาที่ใช้งาน" value={leases.filter((l) => l.status === "ACTIVE").length} />
        <Stat label="เงินที่ชำระแล้วรวม" value={baht(paid)} tone="ok" />
      </div>
      <section className="card">
        <h2 className="font-semibold mb-3">ร้านค้า</h2>
        <div className="divide-y divide-line text-sm">
          {shops.map((s) => (
            <div key={s.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
              <div><Link href={`/seller/shops/${s.id}`} className="font-semibold hover:text-brand">{CATEGORIES[s.category].icon} {s.name}</Link> <span className="text-slate-400">โดย {s.owner.name} · {s.assets.length} รายการ</span></div>
              <form action={toggleShop.bind(null, s.id)}><button className={s.active ? "btn-ghost" : "btn"}>{s.active ? "ระงับร้าน" : "เปิดร้านอีกครั้ง"}</button></form>
            </div>
          ))}
        </div>
      </section>
      <section className="card">
        <h2 className="font-semibold mb-3">ผู้ใช้</h2>
        <table className="w-full text-sm"><tbody>
          {users.map((u) => (<tr key={u.id} className="border-t border-line"><td className="py-1.5">{u.name}</td><td className="text-slate-400">{u.email}</td><td className="text-right">{ROLE[u.role]}</td></tr>))}
        </tbody></table>
      </section>
    </div>
  );
}
