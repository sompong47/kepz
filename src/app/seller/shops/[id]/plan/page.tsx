import { notFound } from "next/navigation";
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
      layout="canva"
      title={`${cat.icon} ${shop.name}`}
    />
  );
}
