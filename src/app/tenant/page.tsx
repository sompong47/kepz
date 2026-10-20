import { desc, eq } from "drizzle-orm";
import { db, leases } from "@/db";
import { requireUser } from "@/lib/auth";
import { cancelLease } from "@/lib/actions";
import { CATEGORIES, BILLING, baht, fmtDate } from "@/lib/domain";
import { Stat } from "@/components/ui";
import Link from "next/link";

export const dynamic = "force-dynamic";
const ST = { PENDING: "รออนุมัติ", ACTIVE: "กำลังเช่า", REJECTED: "ถูกปฏิเสธ", ENDED: "สิ้นสุด/ยกเลิก" } as const;

export default async function Tenant() {
  const u = await requireUser();
  const rows = await db.query.leases.findMany({
    where: eq(leases.tenantId, u.id),
    orderBy: desc(leases.createdAt),
    with: { asset: { with: { shop: true } }, payments: true },
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
      <div className="flex justify-between items-center"><h2 className="font-semibold">การเช่าของฉัน</h2><Link href="/" className="btn">+ เช่าเพิ่ม</Link></div>
      <div className="space-y-3">
        {rows.map((l) => (
          <div key={l.id} className="card">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <div className="font-bold">{CATEGORIES[l.asset.shop.category].icon} {l.asset.shop.name} · {l.asset.code}</div>
                <div className="text-sm text-slate-400">{fmtDate(l.startDate)} – {fmtDate(l.endDate)} · {BILLING[l.billing]}</div>
              </div>
              <span className="text-sm rounded-full bg-panel2 px-3 py-1 h-fit">{ST[l.status]}</span>
            </div>
            {l.status === "ACTIVE" && +l.endDate - now < 30 * 86400000 && <p className="text-amber-400 text-sm mt-2">⚠ สัญญาใกล้หมดอายุ</p>}
            {l.payments.length > 0 && (
              <table className="w-full text-sm mt-3">
                <tbody>
                  {[...l.payments].sort((a, b) => +a.dueDate - +b.dueDate).map((p) => (
                    <tr key={p.id} className="border-t border-line">
                      <td className="py-1.5">ครบกำหนด {fmtDate(p.dueDate)}</td>
                      <td>{baht(p.amount)}</td>
                      <td className="text-right">{p.paidAt ? <span className="text-emerald-400">ชำระแล้ว</span> : +p.dueDate < now ? <span className="text-red-400">เกินกำหนด</span> : <span className="text-slate-400">รอชำระ</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {l.status === "PENDING" && <form action={cancelLease.bind(null, l.id)} className="mt-3"><button className="btn-ghost">ยกเลิกคำขอ</button></form>}
          </div>
        ))}
        {!rows.length && <p className="text-slate-400">ยังไม่มีรายการเช่า</p>}
      </div>
      <p className="text-xs text-slate-500">การชำระเงิน: ผู้ขายยืนยันการรับเงินในระบบ (เฟสถัดไปเพิ่ม PromptPay/แนบสลิปได้)</p>
    </div>
  );
}
