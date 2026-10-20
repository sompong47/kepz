import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, shops, floorsOf } from "@/db";
import { requireUser } from "@/lib/auth";
import { addAsset as _a, deleteAsset, decideLease, markPaid } from "@/lib/actions";
import { CATEGORIES, PERIOD, BILLING, assetState, baht, defaultBox, dimText, fmtDate } from "@/lib/domain";
import { AssetForm } from "@/components/Forms";
import { StateBadge, Stat } from "@/components/ui";
import FloorPlan from "@/components/FloorPlan";
import { toFP } from "@/lib/floor";

export const dynamic = "force-dynamic";
void _a;

export default async function ManageShop({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requireUser();
  const shop = await db.query.shops.findFirst({
    where: eq(shops.id, id),
    with: { features: true, assets: { with: { photos: true, leases: { with: { tenant: true, payments: true } } } } },
  });
  if (!shop || (u.role !== "ADMIN" && shop.ownerId !== u.id)) notFound();
  const floors = await floorsOf(shop.id);
  const cat = CATEGORIES[shop.category];
  const assets = [...shop.assets].sort((a, b) => a.code.localeCompare(b.code, "th", { numeric: true }));
  const leases = assets.flatMap((a) => a.leases.map((l) => ({ ...l, asset: a })));
  const states = assets.map((x) => assetState(x.leases));
  const occupied = states.filter((s) => s === "OCCUPIED" || s === "EXPIRING").length;
  const expiring = states.filter((s) => s === "EXPIRING").length;
  const allPay = leases.filter((l) => l.status === "ACTIVE").flatMap((l) => l.payments);
  const overdue = allPay.filter((p) => !p.paidAt && +p.dueDate < Date.now()).length;
  const m0 = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const revenue = allPay.filter((p) => p.paidAt && +p.paidAt >= m0).reduce((s, p) => s + p.amount, 0);
  const pending = leases.filter((l) => l.status === "PENDING");
  const active = leases.filter((l) => l.status === "ACTIVE");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{cat.icon} {shop.name}</h1>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="อัตราเข้าพัก" value={`${assets.length ? Math.round((occupied / assets.length) * 100) : 0}%`} />
        <Stat label="มีผู้เช่า / ทั้งหมด" value={`${occupied}/${assets.length}`} />
        <Stat label="ใกล้หมดสัญญา" value={expiring} tone={expiring ? "warn" : undefined} />
        <Stat label="เกินกำหนดชำระ" value={overdue} tone={overdue ? "warn" : undefined} />
        <Stat label="รับเงินเดือนนี้" value={baht(revenue)} tone="ok" />
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">ผัง{cat.unit}</h2>
        <FloorPlan shopId={shop.id} category={shop.category} floors={floors} features={shop.features} assets={toFP(assets, true, floors[0].id)} unit={cat.unit} editable />
      </section>

      {pending.length > 0 && (
        <section className="card space-y-3">
          <h2 className="font-semibold">คำขอเช่ารออนุมัติ ({pending.length})</h2>
          {pending.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
              <div className="text-sm"><b>{l.asset.code}</b> · {l.tenant.name} {l.tenant.phone && `(${l.tenant.phone})`}<br /><span className="text-slate-400">{fmtDate(l.startDate)} – {fmtDate(l.endDate)} · {BILLING[l.billing]}</span></div>
              <div className="flex gap-2">
                <form action={decideLease.bind(null, l.id, "ACTIVE")}><button className="btn">อนุมัติ</button></form>
                <form action={decideLease.bind(null, l.id, "REJECTED")}><button className="btn-ghost">ปฏิเสธ</button></form>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="card space-y-3">
        <h2 className="font-semibold">สัญญาเช่าที่ใช้งาน ({active.length})</h2>
        {active.map((l) => (
          <div key={l.id} className="border-t border-line pt-3 space-y-2">
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <div><b>{l.asset.code}</b> · {l.tenant.name} · {baht(l.asset.price)}/{PERIOD[l.asset.period]}<br /><span className="text-slate-400">หมดสัญญา {fmtDate(l.endDate)}</span></div>
              <form action={decideLease.bind(null, l.id, "ENDED")}><button className="btn-ghost">จบสัญญา</button></form>
            </div>
            <div className="flex flex-wrap gap-2">
              {[...l.payments].sort((a, b) => +a.dueDate - +b.dueDate).map((p) => (
                <div key={p.id} className="rounded-lg bg-panel2 px-2.5 py-1.5 text-xs flex items-center gap-2">
                  <span>{fmtDate(p.dueDate)} · {baht(p.amount)}</span>
                  {p.paidAt ? <span className="text-emerald-400">✓ ชำระแล้ว</span> : <form action={markPaid.bind(null, p.id)}><button className={`font-semibold ${+p.dueDate < Date.now() ? "text-red-400" : "text-brand"}`}>ยืนยันรับเงิน</button></form>}
                </div>
              ))}
            </div>
          </div>
        ))}
        {!active.length && <p className="text-sm text-slate-400">ยังไม่มีสัญญา</p>}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <AssetForm shopId={shop.id} unit={cat.unit} />
        <div className="card">
          <h3 className="font-semibold mb-2">รายการ{cat.unit}ทั้งหมด</h3>
          <ul className="text-sm divide-y divide-line">
            {assets.map((a) => (
              <li key={a.id} className="py-2 flex items-center justify-between gap-2">
                <span><b>{a.code}</b> {a.size} · {dimText(a.w ?? defaultBox(0).w, a.h ?? defaultBox(0).h)} · {baht(a.price)}/{PERIOD[a.period]}</span>
                <span className="flex items-center gap-2"><StateBadge state={assetState(a.leases)} />
                  <form action={deleteAsset.bind(null, a.id, shop.id)}><button className="text-red-400 text-xs">ลบ</button></form></span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
