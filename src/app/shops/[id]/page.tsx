import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, shops, floorsOf } from "@/db";
import { getUser } from "@/lib/auth";
import { CATEGORIES, PERIOD, areaText, assetState, baht, defaultBox, dimText, fmtDate, googleMapsHref } from "@/lib/domain";
import { RentForm } from "@/components/Forms";
import { PayInfoProvider } from "@/components/PayContext";
import { StateBadge } from "@/components/ui";
import FloorPlan from "@/components/FloorPlan";
import { toFP } from "@/lib/floor";

export const dynamic = "force-dynamic";

export default async function ShopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shop = await db.query.shops.findFirst({ where: eq(shops.id, id), with: { features: true, assets: { with: { photos: true, leases: true } } } });
  if (!shop || !shop.active) notFound();
  const u = await getUser();
  const isOwner = !!u && (u.id === shop.ownerId || u.role === "ADMIN");
  // ร้านฉบับร่าง: เจ้าของดูตัวอย่างได้ คนอื่นไม่เห็น
  if (!shop.published && !isOwner) notFound();
  const floors = await floorsOf(shop.id);
  const fp = toFP(shop.assets, false, floors[0].id);
  const canRent = !!u && shop.published; // เจ้าของร้านเช่าเองได้ด้วย
  const cat = CATEGORIES[shop.category];
  const assets = [...shop.assets].filter((a) => a.listed && a.price > 0).sort((a, b) => a.code.localeCompare(b.code, "th", { numeric: true }));
  const vacant = assets.filter((a) => assetState(a.leases) === "VACANT").length;
  const mapHref = googleMapsHref(shop.location, shop.mapUrl, shop.name);

  // ส่งเฉพาะฟิลด์ช่องทางรับเงินไปฝั่งเบราว์เซอร์
  const payment = { payBank: shop.payBank, payAccountNo: shop.payAccountNo, payAccountName: shop.payAccountName, payPromptpay: shop.payPromptpay, payQr: shop.payQr, payNote: shop.payNote };
  return (
    <PayInfoProvider payment={payment}>
    <div className="space-y-6">
      {isOwner && (
        <div className={`rounded-2xl px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-2 ${shop.published ? "bg-panel2" : "bg-brand/20 border border-brand"}`}>
          <span>{shop.published ? "นี่คือร้านของคุณ — หน้านี้คือสิ่งที่ผู้เช่าเห็น (คุณเช่าเองได้ด้วย)" : "👀 โหมดดูตัวอย่าง: ร้านยังเป็นฉบับร่าง ผู้เช่ายังไม่เห็นหน้านี้"}</span>
          <Link href={`/seller/shops/${shop.id}`} className="btn-dark !py-1.5">กลับไปจัดการร้าน</Link>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-[1.3fr_1fr] items-center">
        <div>
          <div className="text-sm text-muted font-medium">{cat.icon} {cat.label}</div>
          <h1 className="text-3xl font-bold mt-1">{shop.name}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-sm">
            {mapHref && (
              <a
                href={mapHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-panel border border-line hover:border-brand hover:bg-brand/15 px-3 py-1.5 text-xs font-medium text-ink transition shadow-2xs"
              >
                <span>📍 {shop.location || "ดูตำแหน่งร้าน"}</span>
                <span className="text-brand-ink font-semibold">· เปิดใน Google Maps ↗</span>
              </a>
            )}
            {shop.phone && (
              <a href={`tel:${shop.phone}`} className="inline-flex items-center gap-1 rounded-xl bg-panel border border-line px-3 py-1.5 text-xs text-ink2">
                📞 {shop.phone}
              </a>
            )}
          </div>
          {shop.description && <p className="mt-3 text-sm text-ink2 leading-relaxed">{shop.description}</p>}
        </div>

        {shop.coverPhoto && (
          <div className="rounded-2xl border border-line overflow-hidden bg-panel2 aspect-[16/9] shadow-xs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/photos/${shop.coverPhoto}`} alt={shop.name} className="size-full object-cover" />
          </div>
        )}
      </div>

      <section className="space-y-2">
        <h2 className="font-bold text-lg">🗺️ ผังสถานที่และเลือกตำแหน่ง{cat.unit}เช่า</h2>
        <FloorPlan shopId={shop.id} category={shop.category} floors={floors} features={shop.features} assets={fp} unit={cat.unit} canRent={canRent} />
      </section>

      <h2 className="font-semibold">พื้นที่ที่เปิดให้เช่า ({assets.length}) · <span className="text-ok">ว่าง {vacant}</span></h2>
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
              ) : canRent ? (
                <details className="mt-3"><summary className="btn w-full list-none">เช่า</summary><RentForm assetId={a.id} price={a.price} period={a.period} busy={a.leases.filter((l) => l.status === "ACTIVE").map((l) => ({ start: +l.startDate, end: +l.endDate }))} /></details>
              ) : null}
            </div>
          );
        })}
        {!assets.length && <p className="text-muted">ร้านนี้ยังไม่มีพื้นที่ที่เปิดให้เช่า</p>}
      </div>
    </div>
    </PayInfoProvider>
  );
}
