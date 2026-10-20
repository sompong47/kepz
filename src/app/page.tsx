import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db, shops } from "@/db";
import { CATEGORIES, assetState, type Category } from "@/lib/domain";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const cat = c && c in CATEGORIES ? (c as Category) : null;
  const list = await db.query.shops.findMany({
    where: cat ? and(eq(shops.active, true), eq(shops.category, cat)) : eq(shops.active, true),
    with: { assets: { with: { leases: true } } },
  });
  return (
    <div className="space-y-8">
      <section className="text-center py-8">
        <h1 className="text-4xl font-extrabold">เช่าอะไรก็ได้ <span className="text-brand">ง่ายในที่เดียว</span></h1>
        <p className="text-slate-400 mt-3">ห้องเก็บของ · ที่จอดรถ · แผงตลาด · รถเช่า · เรือเช่า</p>
        <div className="mt-5"><Link href="/register" className="btn">เปิดร้านของคุณเอง</Link></div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link href="/" className={`btn-ghost ${!cat ? "!border-brand text-brand" : ""}`}>ทั้งหมด</Link>
        {Object.entries(CATEGORIES).map(([k, v]) => (
          <Link key={k} href={`/?c=${k}`} className={`btn-ghost ${cat === k ? "!border-brand text-brand" : ""}`}>{v.icon} {v.label}</Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((s) => {
          const vacant = s.assets.filter((a) => assetState(a.leases) === "VACANT").length;
          const from = s.assets.length ? Math.min(...s.assets.map((a) => a.price)) : null;
          return (
            <Link key={s.id} href={`/shops/${s.id}`} className="card hover:border-brand transition">
              <div className="text-3xl">{CATEGORIES[s.category].icon}</div>
              <h3 className="font-bold mt-2">{s.name}</h3>
              <p className="text-sm text-slate-400">{s.location ?? CATEGORIES[s.category].label}</p>
              <p className="text-sm mt-3"><span className="text-emerald-400">ว่าง {vacant}</span> / {s.assets.length} {CATEGORIES[s.category].unit}{from ? <> · เริ่ม <span className="text-brand">฿{from.toLocaleString()}</span></> : null}</p>
            </Link>
          );
        })}
        {!list.length && <p className="text-slate-400">ยังไม่มีร้านในหมวดนี้</p>}
      </div>
    </div>
  );
}
