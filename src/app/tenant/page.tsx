import { and, desc, eq, isNull } from "drizzle-orm";
import { db, leases, shops } from "@/db";
import { requireUser } from "@/lib/auth";
import { cancelLease } from "@/lib/actions";
import { CATEGORIES, BILLING, baht, fmtDate } from "@/lib/domain";
import { Stat } from "@/components/ui";
import Link from "next/link";
import ShopCard from "@/components/ShopCard";

export const dynamic = "force-dynamic";
const ST = { PENDING: "รออนุมัติ", ACTIVE: "กำลังเช่า", REJECTED: "ถูกปฏิเสธ", ENDED: "สิ้นสุด/ยกเลิก" } as const;

export default async function Tenant() {
  const u = await requireUser();
  const rows = await db.query.leases.findMany({
    where: and(eq(leases.tenantId, u.id), isNull(leases.guestName)),
    orderBy: desc(leases.createdAt),
    with: { asset: { with: { shop: true } }, payments: true },
  });
  // ร้านที่เปิดให้เช่า (รวมร้านของตัวเอง ซึ่งเช่าเองได้)
  const open = await db.query.shops.findMany({
    where: and(eq(shops.active, true), eq(shops.published, true)),
    with: { features: true, assets: { with: { photos: true, leases: true } } },
  });
  const now = Date.now();
  const allPay = rows.filter((l) => l.status === "ACTIVE").flatMap((l) => l.payments);
  const due = allPay.filter((p) => !p.paidAt).reduce((s, p) => s + p.amount, 0);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">สวัสดี {u.name}</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat label="กำลังเช่า" value={rows.filter((l) => l.status === "ACTIVE").length} />
        <Stat label="รออนุมัติ" value={rows.filter((l) => l.status === "PENDING").length} />
        <Stat label="ยอดค้างชำระ" value={baht(due)} tone={due ? "warn" : "ok"} />
      </div>
      <div className="flex justify-between items-center"><h2 className="font-semibold">การเช่าของฉัน</h2><Link href="#shops" className="btn">+ ค้นหาพื้นที่เช่า</Link></div>
      <div className="space-y-3">
        {rows.map((l) => (
          <div key={l.id} className="card">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <div className="font-bold">{CATEGORIES[l.asset.shop.category].icon} {l.asset.shop.name} · {l.asset.code}</div>
                <div className="text-sm text-muted">{fmtDate(l.startDate)} – {fmtDate(l.endDate)} · {BILLING[l.billing]}</div>
              </div>
              <span className="text-sm rounded-full bg-panel2 px-3 py-1 h-fit">{ST[l.status]}</span>
            </div>
            {l.status === "ACTIVE" && +l.endDate - now < 30 * 86400000 && <p className="text-warn text-sm mt-2">⚠ สัญญาใกล้หมดอายุ</p>}
            {l.payments.length > 0 && (
              <table className="w-full text-sm mt-3">
                <tbody>
                  {[...l.payments].sort((a, b) => +a.dueDate - +b.dueDate).map((p) => (
                    <tr key={p.id} className="border-t border-line">
                      <td className="py-1.5">ครบกำหนด {fmtDate(p.dueDate)}</td>
                      <td>{baht(p.amount)}</td>
                      <td className="text-right">{p.paidAt ? <span className="text-ok">ชำระแล้ว</span> : +p.dueDate < now ? <span className="text-danger">เกินกำหนด</span> : <span className="text-muted">รอชำระ</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {l.status === "PENDING" && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand/15 px-3 py-2 text-sm">
                <span>⏳ ส่งคำขอแล้ว รอผู้ให้เช่าอนุมัติ — เมื่ออนุมัติจะมีตารางชำระเงินขึ้นที่นี่</span>
                <form action={cancelLease.bind(null, l.id)}><button className="btn-ghost !py-1.5">ยกเลิกคำขอ</button></form>
              </div>
            )}
          </div>
        ))}
        {!rows.length && (
          <div className="card text-center space-y-3 py-10">
            <p className="text-muted">ยังไม่มีรายการเช่า</p>
            <p className="text-sm text-ink2">เลือกร้าน → แตะพื้นที่ในผังหรือการ์ด → เลือกวันที่ → ส่งคำขอเช่า → รอผู้ให้เช่าอนุมัติ</p>
          </div>
        )}
      </div>

      <section id="shops" className="space-y-3 scroll-mt-20">
        <h2 className="font-semibold">ร้านที่เปิดให้เช่า ({open.length})</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {open.map((s) => <ShopCard key={s.id} s={s} viewerId={u.id} />)}
        </div>
        {!open.length && <p className="text-sm text-muted">ยังไม่มีร้านที่เปิดให้เช่า</p>}
      </section>
      <p className="text-xs text-muted">การชำระเงิน: ผู้ขายยืนยันการรับเงินในระบบ (เฟสถัดไปเพิ่ม PromptPay/แนบสลิปได้)</p>
    </div>
  );
}
