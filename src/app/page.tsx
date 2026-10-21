import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db, shops } from "@/db";
import { CATEGORIES, assetState, type Category } from "@/lib/domain";
import { IconBadge, LogoMark, type IconName } from "@/components/Brand";

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
    where: cat ? and(eq(shops.active, true), eq(shops.category, cat)) : eq(shops.active, true),
    with: { assets: { with: { leases: true } } },
  });
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
          {list.map((s) => {
            const priced = s.assets.filter((a) => a.price > 0);
            const vacant = priced.filter((a) => assetState(a.leases) === "VACANT").length;
            const from = priced.length ? Math.min(...priced.map((a) => a.price)) : null;
            return (
              <Link key={s.id} href={`/shops/${s.id}`} className="card hover:border-brand hover:shadow-md transition group">
                <div className="flex items-start justify-between">
                  <span className="grid place-items-center size-12 rounded-full bg-brand text-2xl">{CATEGORIES[s.category].icon}</span>
                  <span className="text-xs rounded-full bg-panel2 px-2.5 py-1 text-ink2">{CATEGORIES[s.category].label}</span>
                </div>
                <h3 className="font-semibold text-lg mt-3 group-hover:underline decoration-brand decoration-2 underline-offset-4">{s.name}</h3>
                <p className="text-sm text-muted">{s.location ?? CATEGORIES[s.category].label}</p>
                <p className="text-sm mt-3">
                  <span className="text-ok font-medium">ว่าง {vacant}</span> / {priced.length} {CATEGORIES[s.category].unit}
                  {from ? <> · เริ่ม <span className="font-semibold">฿{from.toLocaleString()}</span></> : null}
                </p>
              </Link>
            );
          })}
          {!list.length && <p className="text-muted">ยังไม่มีร้านในหมวดนี้</p>}
        </div>
      </section>
    </div>
  );
}
