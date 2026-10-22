import Link from "next/link";
import { CATEGORIES, assetState, googleMapsHref, type Category } from "@/lib/domain";

type ShopRow = {
  id: string;
  name: string;
  category: Category;
  location: string | null;
  mapUrl?: string | null;
  coverPhoto?: string | null;
  ownerId: string;
  assets: {
    price: number;
    listed: boolean;
    photos?: { id: string }[];
    leases: { status: string; startDate: Date; endDate: Date }[];
  }[];
};

/** การ์ดร้านที่เปิดให้เช่า: แสดงรูปสถานที่จริง + กดหมุดเปิด Google Maps ได้ทันที */
export default function ShopCard({ s, viewerId }: { s: ShopRow; viewerId?: string }) {
  const cat = CATEGORIES[s.category];
  const open = s.assets.filter((a) => a.listed && a.price > 0);
  const vacant = open.filter((a) => assetState(a.leases) === "VACANT").length;
  const from = open.length ? Math.min(...open.map((a) => a.price)) : null;
  const mine = !!viewerId && viewerId === s.ownerId;

  // ใช้รูปปกร้านก่อน ถ้ายังไม่อัปโหลดให้ใช้รูปแรกของห้องเช่าในร้านแทน
  const fallbackAssetPhoto = s.assets.flatMap((a) => a.photos ?? [])[0]?.id;
  const photoSrc = s.coverPhoto
    ? `/api/photos/${s.coverPhoto}`
    : fallbackAssetPhoto
      ? `/api/photos/${fallbackAssetPhoto}`
      : null;

  const mapHref = googleMapsHref(s.location, s.mapUrl, s.name);

  return (
    <div className="card !p-4 hover:border-brand hover:shadow-md transition group flex flex-col justify-between">
      <div>
        {/* รูปภาพสถานที่จริงของร้าน */}
        <Link href={`/shops/${s.id}`} className="block relative mb-3 rounded-xl border border-line bg-panel2 overflow-hidden aspect-[16/10]">
          {photoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoSrc}
              alt={s.name}
              loading="lazy"
              className="size-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            />
          ) : (
            <div className="size-full flex flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-[#fff9db] to-[#f6f4ec] text-center p-4">
              <span className="grid place-items-center size-14 rounded-2xl bg-brand/30 text-3xl shadow-xs">{cat.icon}</span>
              <span className="text-xs text-muted font-medium">
                {mine ? "📷 ยังไม่มีรูปสถานที่จริง (ตั้งค่ารูปหน้าร้านได้)" : `สถานที่จริง · ${cat.label}`}
              </span>
            </div>
          )}

          <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 rounded-full bg-white/95 backdrop-blur px-2.5 py-1 text-xs font-medium shadow-xs border border-black/5">
            <span>{cat.icon}</span>
            <span>{cat.label}</span>
          </div>
          {mine && (
            <span className="absolute top-2.5 right-2.5 text-[11px] rounded-full bg-ink/90 text-white px-2.5 py-0.5 font-medium">
              ร้านของคุณ
            </span>
          )}
          <div className="absolute bottom-2.5 right-2.5 flex items-center gap-2 rounded-full bg-white/95 backdrop-blur px-2.5 py-0.5 text-[11px] text-ink2 shadow-xs border border-black/5">
            <span className="flex items-center gap-1 font-medium text-ok">● ว่าง {vacant}</span>
            <span className="text-muted">·</span>
            <span className="flex items-center gap-1">เช่าแล้ว {open.length - vacant}</span>
          </div>
        </Link>

        <Link href={`/shops/${s.id}`} className="block">
          <h3 className="font-bold text-lg group-hover:underline decoration-brand decoration-2 underline-offset-4">
            {s.name}
          </h3>
        </Link>

        {/* หมุดที่ตั้ง: กดแล้วเด้งไป Google Maps ทันที */}
        {mapHref ? (
          <a
            href={mapHref}
            target="_blank"
            rel="noopener noreferrer"
            title="คลิกเพื่อเปิดดูพิกัดสถานที่จริงบน Google Maps"
            className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-panel2 hover:bg-brand/25 px-2.5 py-1 text-xs font-medium text-ink2 hover:text-ink transition"
          >
            <span>📍</span>
            <span className="underline decoration-dotted underline-offset-2">{s.location || "ดูตำแหน่งที่ตั้ง"}</span>
            <span className="text-[11px] font-semibold text-brand-ink">· เปิด Google Maps ↗</span>
          </a>
        ) : (
          <p className="text-xs text-muted mt-1">📍 {cat.label}</p>
        )}
      </div>

      <Link href={`/shops/${s.id}`} className="mt-3 pt-2.5 border-t border-line flex items-center justify-between text-sm">
        <div>
          <span className="text-ok font-semibold">ว่าง {vacant}</span>
          <span className="text-muted text-xs"> / {open.length} {cat.unit}</span>
          {from ? (
            <span className="text-xs text-ink2 ml-1.5">
              · เริ่ม <b className="text-ink">฿{from.toLocaleString()}</b>
            </span>
          ) : null}
        </div>
        <span className="text-xs font-semibold text-brand-ink group-hover:translate-x-0.5 transition-transform">
          {vacant ? "ดูสถานที่ & จองในผัง →" : "ดูผังร้าน →"}
        </span>
      </Link>
    </div>
  );
}
