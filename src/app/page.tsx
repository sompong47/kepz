import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db, shops } from "@/db";
import { CATEGORIES, assetState, type Category } from "@/lib/domain";
import { IconBadge, LogoMark, Wordmark, type IconName } from "@/components/Brand";
import ShopCard from "@/components/ShopCard";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const STEPS: [IconName, string, string][] = [
  ["search", "DISCOVER", "ค้นหาผังร้านที่ใช่"],
  ["chat", "SELECT", "จิ้มเลือกตำแหน่งจากผังจริง"],
  ["key", "RENT", "เช่าง่าย จบในที่เดียว"],
  ["shield", "TRUSTED", "จัดการบิลและสัญญาชัดเจน"],
];

export default async function Home({ searchParams }: { searchParams: Promise<{ c?: string; q?: string; v?: string }> }) {
  const { c, q, v } = await searchParams;
  const cat = c && c in CATEGORIES ? (c as Category) : null;
  const query = (q ?? "").trim().toLowerCase();
  const onlyVacant = v === "1";

  const rawList = await db.query.shops.findMany({
    where: and(eq(shops.active, true), eq(shops.published, true), cat ? eq(shops.category, cat) : undefined),
    with: { features: true, assets: { with: { photos: true, leases: true } } },
  });

  const list = rawList.filter((s) => {
    if (query) {
      const text = `${s.name} ${s.location ?? ""} ${s.description ?? ""}`.toLowerCase();
      if (!text.includes(query)) return false;
    }
    if (onlyVacant) {
      const hasVacancy = s.assets.some((a) => a.listed && a.price > 0 && assetState(a.leases) === "VACANT");
      if (!hasVacancy) return false;
    }
    return true;
  });

  const u = await getUser();
  return (
    <div className="space-y-10">
      <section className="grid gap-8 lg:grid-cols-[1.2fr_1fr] items-center pt-4">
        <div>
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight">
            พื้นที่ให้เช่าทุกแบบ<br />
            <span className="text-brand [-webkit-text-stroke:0.5px_#111]">เห็นผังจริง จองง่ายในที่เดียว</span>
          </h1>
          <div className="mt-4 h-1 w-14 rounded-full bg-brand" />
          <p className="text-ink2 mt-4 text-lg">
            ห้องเก็บของ · ที่จอดรถ · แผงตลาด · รถเช่า · เรือเช่า<br />
            เจ้าของสร้างผังร้านได้ง่ายเหมือน Canva · ผู้เช่าจิ้มเลือกตำแหน่งที่ถูกใจจากผังได้ทันที
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="#shops" className="btn">🔍 ค้นหาพื้นที่เช่า</Link>
            <Link href="/seller/shops/new" className="btn-dark">✨ เปิดร้านพร้อมสร้างผังฟรี</Link>
          </div>
        </div>
        <div className="hidden lg:grid place-items-center rounded-3xl bg-brand aspect-[4/3] shadow-[0_20px_40px_-20px_rgba(17,17,17,.35)]">
          <div className="text-center">
            <div className="flex justify-center"><LogoMark size={120} onBrand /></div>
            <div className="mt-6"><Wordmark size={44} onBrand tagline mark={false} /></div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-6">
        {STEPS.map(([icon, title, sub]) => (
          <div key={title} className="flex flex-col items-center text-center gap-2">
            <IconBadge name={icon} />
            <div className="font-semibold tracking-wide text-sm">{title}</div>
            <div className="text-sm text-muted">{sub}</div>
          </div>
        ))}
      </section>

      <section id="shops" className="space-y-4 scroll-mt-20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">สำรวจร้านและผังพื้นที่เช่า ({list.length})</h2>
          <form action="/#shops" className="flex flex-wrap items-center gap-2">
            {cat && <input type="hidden" name="c" value={cat} />}
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="ค้นหาชื่อร้าน หรือทำเล…"
              className="input !w-52 !py-2"
            />
            <label className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-panel px-3 py-2 text-xs font-medium cursor-pointer">
              <input type="checkbox" name="v" value="1" defaultChecked={onlyVacant} className="size-4 accent-[#16a34a]" />
              <span>เฉพาะที่มีว่าง</span>
            </label>
            <button className="btn-dark !py-2">ค้นหา</button>
            {(q || onlyVacant) && (
              <Link href={cat ? `/?c=${cat}#shops` : "/#shops"} className="btn-ghost !py-2 text-xs">
                ล้างตัวกรอง
              </Link>
            )}
          </form>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href={`/${q ? `?q=${encodeURIComponent(q)}` : ""}#shops`} className={`btn-ghost ${!cat ? "pill-on" : ""}`}>ทั้งหมด</Link>
          {Object.entries(CATEGORIES).map(([k, val]) => (
            <Link key={k} href={`/?c=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}${onlyVacant ? "&v=1" : ""}#shops`} className={`btn-ghost ${cat === k ? "pill-on" : ""}`}>
              {val.icon} {val.label}
            </Link>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((s) => <ShopCard key={s.id} s={s} viewerId={u?.id} />)}
          {!list.length && (
            <div className="card col-span-full text-center py-10 space-y-2">
              <p className="text-muted">ไม่พบร้านที่ตรงกับเงื่อนไขการค้นหา</p>
              <Link href="/#shops" className="btn-ghost text-xs">ดูร้านทั้งหมด</Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
