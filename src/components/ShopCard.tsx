import Link from "next/link";
import { CATEGORIES, assetState, type Category } from "@/lib/domain";

type ShopRow = {
  id: string; name: string; category: Category; location: string | null; ownerId: string;
  assets: { price: number; listed: boolean; leases: { status: string; startDate: Date; endDate: Date }[] }[];
};

/** การ์ดร้านที่เปิดให้เช่า (หน้าแรก + หน้าการเช่าของฉัน) */
export default function ShopCard({ s, viewerId }: { s: ShopRow; viewerId?: string }) {
  const cat = CATEGORIES[s.category];
  const open = s.assets.filter((a) => a.listed && a.price > 0);
  const vacant = open.filter((a) => assetState(a.leases) === "VACANT").length;
  const from = open.length ? Math.min(...open.map((a) => a.price)) : null;
  const mine = !!viewerId && viewerId === s.ownerId;
  return (
    <Link href={`/shops/${s.id}`} className="card hover:border-brand hover:shadow-md transition group">
      <div className="flex items-start justify-between gap-2">
        <span className="grid place-items-center size-12 rounded-full bg-brand text-2xl">{cat.icon}</span>
        <span className="flex flex-col items-end gap-1">
          <span className="text-xs rounded-full bg-panel2 px-2.5 py-1 text-ink2">{cat.label}</span>
          {mine && <span className="text-xs rounded-full bg-ink text-white px-2.5 py-1">ร้านของคุณ</span>}
        </span>
      </div>
      <h3 className="font-semibold text-lg mt-3 group-hover:underline decoration-brand decoration-2 underline-offset-4">{s.name}</h3>
      <p className="text-sm text-muted">{s.location ?? cat.label}</p>
      <p className="text-sm mt-3">
        <span className="text-ok font-medium">ว่าง {vacant}</span> / {open.length} {cat.unit}
        {from ? <> · เริ่ม <span className="font-semibold">฿{from.toLocaleString()}</span></> : null}
      </p>
      <p className="mt-3 text-sm font-semibold text-brand-ink">{vacant ? "ดูผังและเช่า →" : "ดูผัง / จองล่วงหน้า →"}</p>
    </Link>
  );
}
