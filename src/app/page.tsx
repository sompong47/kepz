import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db, shops } from "@/db";
import { CATEGORIES, type Category } from "@/lib/domain";
import { IconBadge, LogoMark, type IconName } from "@/components/Brand";
import ShopCard from "@/components/ShopCard";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const STEPS: [IconName, string, string][] = [
  ["search", "DISCOVER", "ค้นหาที่ใช่"],
  ["chat", "CONNECT", "ติดต่อได้โดยตรง"],
  ["key", "RENT", "เช่าง่าย จบในที่เดียว"],
  ["shield", "TRUSTED", "ปลอดภัย มั่นใจ"],
];

export default async function Home({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const cat = c && c in CATEGORIES ? (c as Category) : null;
  const list = await db.query.shops.findMany({
    where: and(eq(shops.active, true), eq(shops.published, true), cat ? eq(shops.category, cat) : undefined),
    with: { assets: { with: { leases: true } } },
  });
  const u = await getUser();
  return (
    <div className="space-y-10">
      <section className="grid gap-8 lg:grid-cols-[1.2fr_1fr] items-center pt-4">
        <div>
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight">
            พื้นที่ให้เช่าทุกแบบ<br />
            <span className="text-brand [-webkit-text-stroke:0.5px_#111]">ง่ายในที่เดียว</span>
          </h1>
          <div className="mt-4 h-1 w-14 rounded-full bg-brand" />
          <p className="text-ink2 mt-4 text-lg">ห้องเก็บของ · ที่จอดรถ · แผงตลาด · รถเช่า · เรือเช่า<br />เปิดร้านพร้อมผังดิจิทัลของตัวเอง แล้วเชื่อมต่อกับผู้เช่าที่ใช่</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="#shops" className="btn">ค้นหาพื้นที่เช่า</Link>
            <Link href="/seller/shops/new" className="btn-dark">เปิดร้านของคุณเอง</Link>
          </div>
        </div>
        <div className="hidden lg:grid place-items-center rounded-3xl bg-brand aspect-[4/3] shadow-[0_20px_40px_-20px_rgba(17,17,17,.35)]">
          <div className="text-center">
            <div className="flex justify-center"><LogoMark size={110} /></div>
            <div className="mt-4 text-4xl font-bold tracking-[0.12em]">KEPZ</div>
            <div className="text-xs font-medium tracking-[0.25em] text-ink2">RENTAL SPACE PLATFORM</div>
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
        <h2 className="text-2xl font-bold">ร้านทั้งหมด</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/#shops" className={`btn-ghost ${!cat ? "pill-on" : ""}`}>ทั้งหมด</Link>
          {Object.entries(CATEGORIES).map(([k, v]) => (
            <Link key={k} href={`/?c=${k}#shops`} className={`btn-ghost ${cat === k ? "pill-on" : ""}`}>{v.icon} {v.label}</Link>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((s) => <ShopCard key={s.id} s={s} viewerId={u?.id} />)}
          {!list.length && <p className="text-muted">ยังไม่มีร้านในหมวดนี้</p>}
        </div>
      </section>
    </div>
  );
}
