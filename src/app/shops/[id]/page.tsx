import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, shops } from "@/db";
import { getUser } from "@/lib/auth";
import { CATEGORIES, PERIOD, assetState, baht, fmtDate } from "@/lib/domain";
import { RentForm } from "@/components/Forms";
import { StateBadge } from "@/components/ui";
import FloorPlan from "@/components/FloorPlan";
import { toFP } from "@/lib/floor";

export const dynamic = "force-dynamic";

export default async function ShopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shop = await db.query.shops.findFirst({ where: eq(shops.id, id), with: { assets: { with: { leases: true } } } });
  const fp = toFP(shop?.assets ?? [], false);
  if (!shop || !shop.active) notFound();
  const u = await getUser();
  const cat = CATEGORIES[shop.category];
  const assets = [...shop.assets].sort((a, b) => a.code.localeCompare(b.code, "th", { numeric: true }));
  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm text-slate-400">{cat.icon} {cat.label}</div>
        <h1 className="text-3xl font-bold">{shop.name}</h1>
        <p className="text-slate-400">{[shop.location, shop.phone].filter(Boolean).join(" · ")}</p>
        {shop.description && <p className="mt-2">{shop.description}</p>}
      </div>
      <FloorPlan shopId={shop.id} assets={fp} unit={cat.unit} canRent={u?.role === "TENANT"} />
      <h2 className="font-semibold">รายการทั้งหมด</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {assets.map((a) => {
          const st = assetState(a.leases);
          const busyUntil = a.leases.filter((l) => l.status === "ACTIVE").map((l) => +l.endDate).sort().pop();
          return (
            <div key={a.id} className="card">
              <div className="flex items-start justify-between">
                <div><div className="text-xl font-bold">{a.code}</div><div className="text-sm text-slate-400">{a.size}</div></div>
                <StateBadge state={st} />
              </div>
              <div className="mt-2 text-brand font-semibold">{baht(a.price)} <span className="text-slate-400 font-normal text-sm">/ {PERIOD[a.period]}</span></div>
              {a.note && <p className="text-xs text-slate-400 mt-1">{a.note}</p>}
              {busyUntil && st !== "VACANT" && <p className="text-xs text-slate-400 mt-1">ไม่ว่างถึง {fmtDate(busyUntil)}</p>}
              {!u ? (
                <Link href="/login" className="btn-ghost w-full mt-3">เข้าสู่ระบบเพื่อเช่า</Link>
              ) : u.role === "TENANT" && a.price > 0 ? (
                <details className="mt-3"><summary className="btn w-full list-none">เช่า</summary><RentForm assetId={a.id} period={a.period} /></details>
              ) : null}
            </div>
          );
        })}
        {!assets.length && <p className="text-slate-400">ร้านนี้ยังไม่มีรายการ</p>}
      </div>
    </div>
  );
}
