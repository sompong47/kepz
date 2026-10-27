import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, shops, floorsOf } from "@/db";
import { getUser } from "@/lib/auth";
import { CATEGORIES, assetState, googleMapsHref } from "@/lib/domain";
import FloorPlan from "@/components/FloorPlan";
import { toFP } from "@/lib/floor";

export const dynamic = "force-dynamic";

/** หน้าดูผังออนไลน์สำหรับแชร์ (Public Showcase Link) — เปิดดูผัง ซูม ค้นหา และดาวน์โหลดรูปผังได้โดยไม่ต้องล็อกอิน */
export default async function ShopPublicShowcase({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shop = await db.query.shops.findFirst({
    where: eq(shops.id, id),
    with: { features: true, assets: { with: { photos: true, leases: true } } },
  });
  if (!shop || !shop.active) notFound();

  const u = await getUser();
  const isOwner = !!u && (u.id === shop.ownerId || u.role === "ADMIN");
  const floors = await floorsOf(shop.id);
  const cat = CATEGORIES[shop.category];
  const openAssets = shop.assets.filter((a) => a.listed || a.price > 0);
  const vacant = openAssets.filter((a) => assetState(a.leases) === "VACANT").length;
  const mapHref = googleMapsHref(shop.location, shop.mapUrl, shop.name);

  return (
    <div className="space-y-5">
      {isOwner && (
        <div className="rounded-2xl bg-brand/20 border border-brand px-4 py-2.5 text-sm flex flex-wrap items-center justify-between gap-2">
          <span>👀 <b>มุมมองลิงก์แชร์สาธารณะ:</b> ลูกค้าหรือคนที่ได้รับลิงก์จะเห็นผังหน้านี้โดยไม่ต้องล็อกอิน</span>
          <div className="flex gap-2">
            <Link href={`/seller/shops/${shop.id}/plan`} className="btn !py-1.5 text-xs">🎨 เปิดสตูดิโอแต่งผัง</Link>
            <Link href={`/seller/shops/${shop.id}`} className="btn-dark !py-1.5 text-xs">กลับหน้าจัดการร้าน</Link>
          </div>
        </div>
      )}

      <div className="card flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs font-semibold text-brand-ink">{cat.icon} ผัง{cat.label}ออนไลน์</div>
          <h1 className="text-2xl sm:text-3xl font-bold">{shop.name}</h1>
          {shop.description && <p className="text-sm text-ink2 max-w-2xl">{shop.description}</p>}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {mapHref && (
              <a href={mapHref} target="_blank" rel="noopener noreferrer" className="btn-ghost !py-1 !px-2.5 text-xs">
                📍 {shop.location || "ดูพิกัด Google Maps"} ↗
              </a>
            )}
            {shop.phone && (
              <a href={`tel:${shop.phone}`} className="btn !py-1 !px-3 text-xs">
                📞 โทรติดต่อ: {shop.phone}
              </a>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl bg-panel2 px-4 py-3 border border-line">
          <div className="text-center px-2">
            <div className="text-2xl font-extrabold text-ok">{vacant}</div>
            <div className="text-[11px] text-muted">{cat.unit}ว่าง</div>
          </div>
          <div className="h-8 w-px bg-line" />
          <div className="text-center px-2">
            <div className="text-2xl font-extrabold text-ink">{openAssets.length - vacant}</div>
            <div className="text-[11px] text-muted">มีผู้เช่าแล้ว</div>
          </div>
          <div className="h-8 w-px bg-line" />
          <div className="text-center px-2">
            <div className="text-2xl font-extrabold text-ink2">{openAssets.length}</div>
            <div className="text-[11px] text-muted">ทั้งหมด</div>
          </div>
        </div>
      </div>

      <FloorPlan
        shopId={shop.id}
        category={shop.category}
        floors={floors}
        features={shop.features}
        assets={toFP(shop.assets, false, floors[0].id)}
        unit={cat.unit}
        title={`${cat.icon} ${shop.name}`}
      />
    </div>
  );
}
