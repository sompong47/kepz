import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, shops, floorsOf } from "@/db";
import { requireUser } from "@/lib/auth";
import { CATEGORIES } from "@/lib/domain";
import FloorPlan from "@/components/FloorPlan";
import { toFP } from "@/lib/floor";

export const dynamic = "force-dynamic";

/** หน้าแก้/ตกแต่งผังร้าน (แยกจากหน้าจัดการร้าน เพื่อให้มีพื้นที่ทำงานเต็มจอ) */
export default async function EditPlan({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ gen?: string }> }) {
  const [{ id }, { gen }] = await Promise.all([params, searchParams]);
  const u = await requireUser();
  const shop = await db.query.shops.findFirst({
    where: eq(shops.id, id),
    with: { features: true, assets: { with: { photos: true, leases: { with: { tenant: true, payments: true } } } } },
  });
  if (!shop || (u.role !== "ADMIN" && shop.ownerId !== u.id)) notFound();
  const floors = await floorsOf(shop.id);
  const cat = CATEGORIES[shop.category];
  const back = `/seller/shops/${shop.id}`;

  return (
    // กว้างกว่าคอนเทนต์ปกติ (max-w-6xl) ให้ผังมีที่ทำงานมากขึ้น
    <div className="relative left-1/2 -translate-x-1/2 w-[min(1600px,calc(100vw-3rem))] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={back} className="text-xs text-muted hover:text-ink">← กลับไปหน้าจัดการร้าน</Link>
          <h1 className="text-2xl font-bold mt-0.5">🎨 แก้ไขผังร้าน · {cat.icon} {shop.name}</h1>
          <p className="text-sm text-muted">วาดผังสถานที่ วาง{cat.unit} ตั้งราคา แล้วกด “✓ เสร็จสิ้นการแต่งผัง” เพื่อกลับหน้าจัดการร้าน · ทุกการเปลี่ยนแปลงบันทึกอัตโนมัติ</p>
        </div>
        <Link href={`/shops/${shop.id}`} className="btn-ghost text-sm">ดูหน้าร้าน (มุมมองผู้เช่า) ↗</Link>
      </div>

      <FloorPlan
        shopId={shop.id}
        category={shop.category}
        floors={floors}
        features={shop.features}
        assets={toFP([...shop.assets], true, floors[0].id)}
        unit={cat.unit}
        editable
        startEditing
        startGen={gen === "1"}
        doneHref={back}
      />
    </div>
  );
}
