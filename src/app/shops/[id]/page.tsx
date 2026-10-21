import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, shops, floorsOf } from "@/db";
import { getUser } from "@/lib/auth";
import { CATEGORIES, PERIOD, areaText, assetState, baht, defaultBox, dimText, fmtDate } from "@/lib/domain";
import { RentForm } from "@/components/Forms";
import { StateBadge } from "@/components/ui";
import FloorPlan from "@/components/FloorPlan";
import { toFP } from "@/lib/floor";

export const dynamic = "force-dynamic";

export default async function ShopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shop = await db.query.shops.findFirst({ where: eq(shops.id, id), with: { features: true, assets: { with: { photos: true, leases: true } } } });
  if (!shop || !shop.active) notFound();
  const floors = await floorsOf(shop.id);
  const fp = toFP(shop.assets, false, floors[0].id);
  const u = await getUser();
  const canRent = !!u && u.id !== shop.ownerId;
  const cat = CATEGORIES[shop.category];
  const assets = [...shop.assets].sort((a, b) => a.code.localeCompare(b.code, "th", { numeric: true }));
  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm text-muted">{cat.icon} {cat.label}</div>
        <h1 className="text-3xl font-bold">{shop.name}</h1>
        <p className="text-muted">{[shop.location, shop.phone].filter(Boolean).join(" · ")}</p>
        {shop.description && <p className="mt-2">{shop.description}</p>}
      </div>
      <FloorPlan shopId={shop.id} category={shop.category} floors={floors} features={shop.features} assets={fp} unit={cat.unit} canRent={canRent} />
      <h2 className="font-semibold">รายการทั้งหมด</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {assets.map((a) => {
          const st = assetState(a.leases);
          const busyUntil = a.leases.filter((l) => l.status === "ACTIVE").map((l) => +l.endDate).sort().pop();
          return (
            <div key={a.id} className="card">
              {a.photos[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/photos/${a.photos[0].id}`} alt={a.code} loading="lazy" className="w-full aspect-video object-cover rounded-xl mb-3 bg-panel2" />
              )}
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xl font-bold">{a.code} <span className="text-sm font-normal text-muted">{a.size}</span></div>
                  <div className="text-sm text-muted">{dimText(a.w ?? defaultBox(0).w, a.h ?? defaultBox(0).h)} · {areaText(a.w ?? defaultBox(0).w, a.h ?? defaultBox(0).h)}</div>
                </div>
                <StateBadge state={st} />
              </div>
              <div className="mt-2 text-brand-ink font-semibold">{baht(a.price)} <span className="text-muted font-normal text-sm">/ {PERIOD[a.period]}</span></div>
              {a.note && <p className="text-xs text-muted mt-1">{a.note}</p>}
              {busyUntil && st !== "VACANT" && <p className="text-xs text-muted mt-1">ไม่ว่างถึง {fmtDate(busyUntil)}</p>}
              {!u ? (
                <Link href="/login" className="btn-ghost w-full mt-3">เข้าสู่ระบบเพื่อเช่า</Link>
              ) : canRent && a.price > 0 ? (
                <details className="mt-3"><summary className="btn w-full list-none">เช่า</summary><RentForm assetId={a.id} period={a.period} /></details>
              ) : null}
            </div>
          );
        })}
        {!assets.length && <p className="text-muted">ร้านนี้ยังไม่มีรายการ</p>}
      </div>
    </div>
  );
}
