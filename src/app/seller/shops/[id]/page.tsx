import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, shops, floorsOf } from "@/db";
import { requireUser } from "@/lib/auth";
import { deleteAsset, decideLease, markPaid, toggleListed } from "@/lib/actions";
import { CATEGORIES, PERIOD, BILLING, assetState, baht, defaultBox, dimText, fmtDate, googleMapsHref } from "@/lib/domain";
import { AssetForm, ShopCoverBar, ShopSettingsForm, WalkInForm } from "@/components/Forms";
import { StateBadge, Stat } from "@/components/ui";
import FloorPlan from "@/components/FloorPlan";
import { PublishBar } from "@/components/Listing";
import { SlipLink } from "@/components/Slip";
import ShopTabs from "@/components/ShopTabs";
import { toFP } from "@/lib/floor";

export const dynamic = "force-dynamic";

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
  const vacantPriced = assets.filter((a) => a.price > 0 && assetState(a.leases) === "VACANT");
  const mapHref = googleMapsHref(shop.location, shop.mapUrl, shop.name);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/seller" className="text-xs text-muted hover:text-ink">← กลับหน้าร้านของฉัน</Link>
          <h1 className="text-2xl sm:text-3xl font-bold mt-0.5">{cat.icon} {shop.name}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-muted">
            {mapHref && (
              <a href={mapHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-panel2 hover:bg-brand/25 px-2.5 py-0.5 text-xs font-medium text-ink2">
                📍 {shop.location || "ดูพิกัดร้าน"} <span className="text-brand-ink font-semibold">· เปิด Google Maps ↗</span>
              </a>
            )}
            {shop.phone && <span>📞 {shop.phone}</span>}
          </div>
        </div>
      </div>

      <ShopCoverBar shopId={shop.id} coverPhoto={shop.coverPhoto} shopName={shop.name} />

      <PublishBar
        shopId={shop.id} published={shop.published} active={shop.active} unit={cat.unit}
        total={assets.length} priced={assets.filter((a) => a.price > 0).length} listed={assets.filter((a) => a.listed).length}
        unlistedIds={assets.filter((a) => !a.listed).map((a) => a.id)} hasPlan={shop.features.length > 0}
        payment={shop}
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="อัตราเข้าพัก" value={`${assets.length ? Math.round((occupied / assets.length) * 100) : 0}%`} />
        <Stat label="มีผู้เช่า / ทั้งหมด" value={`${occupied}/${assets.length}`} />
        <Stat label="ใกล้หมดสัญญา" value={expiring} tone={expiring ? "warn" : undefined} />
        <Stat label="เกินกำหนดชำระ" value={overdue} tone={overdue ? "warn" : undefined} />
        <Stat label="รับเงินเดือนนี้" value={baht(revenue)} tone="ok" />
      </div>

      <ShopTabs
        unit={cat.unit}
        totalUnits={assets.length}
        pendingCount={pending.length}
        activeCount={active.length}
        overdueCount={overdue}
        planTab={
          <FloorPlan
            shopId={shop.id}
            category={shop.category}
            floors={floors}
            features={shop.features}
            assets={toFP(assets, true, floors[0].id)}
            unit={cat.unit}
            editable
            editHref={`/seller/shops/${shop.id}/plan`}
          />
        }
        leasesTab={
          <div className="space-y-5">
            {pending.length > 0 && (
              <section className="card space-y-3 border-brand">
                <h2 className="font-bold text-lg">⏳ คำขอเช่ารออนุมัติ ({pending.length})</h2>
                {pending.map((l) => (
                  <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                    <div className="text-sm">
                      <b>{l.asset.code}</b> · {l.guestName || l.tenant.name} {(l.guestPhone || l.tenant.phone) && `(${l.guestPhone || l.tenant.phone})`}
                      <br />
                      <span className="text-muted">{fmtDate(l.startDate)} – {fmtDate(l.endDate)} · {BILLING[l.billing]} · {baht(l.asset.price)}/{PERIOD[l.asset.period]}</span>
                      {l.slip && <span className="ml-2 text-xs">· แนบสลิปงวดแรกมา <SlipLink slip={l.slip} /></span>}
                    </div>
                    <div className="flex gap-2">
                      <form action={decideLease.bind(null, l.id, "ACTIVE")}><button className="btn">✓ อนุมัติ</button></form>
                      <form action={decideLease.bind(null, l.id, "REJECTED")}><button className="btn-ghost">✕ ปฏิเสธ</button></form>
                    </div>
                  </div>
                ))}
              </section>
            )}

            <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
              <section className="card space-y-3 self-start">
                <h2 className="font-bold text-lg">📋 สัญญาเช่าที่ใช้งาน ({active.length})</h2>
                {active.map((l) => {
                  const tName = l.guestName || l.tenant.name;
                  const tPhone = l.guestPhone || l.tenant.phone;
                  return (
                    <div key={l.id} className="border-t border-line pt-3 space-y-2">
                      <div className="flex flex-wrap justify-between gap-2 text-sm">
                        <div>
                          <b>{l.asset.code}</b> · {tName} {tPhone && <span className="text-muted">({tPhone})</span>}
                          {l.guestName && <span className="ml-1.5 rounded-full bg-panel2 px-2 py-0.5 text-[11px] text-ink2">Walk-in</span>}
                          <br />
                          <span className="text-muted">
                            {baht(l.asset.price)}/{PERIOD[l.asset.period]} · สัญญา {fmtDate(l.startDate)} – {fmtDate(l.endDate)}
                          </span>
                        </div>
                        <form action={decideLease.bind(null, l.id, "ENDED")}><button className="btn-ghost !py-1 text-xs">จบสัญญา</button></form>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {[...l.payments].sort((a, b) => +a.dueDate - +b.dueDate).map((p) => (
                          <div key={p.id} className="rounded-lg bg-panel2 px-2.5 py-1.5 text-xs flex items-center gap-2">
                            <span>{fmtDate(p.dueDate)} · {baht(p.amount)}</span>
                            {p.slip && <SlipLink slip={p.slip} />}
                            {p.paidAt ? (
                              <span className="text-ok font-medium">✓ ชำระแล้ว</span>
                            ) : (
                              <form action={markPaid.bind(null, p.id)}>
                                <button className={`font-semibold cursor-pointer underline ${+p.dueDate < Date.now() ? "text-danger" : "text-brand-ink"}`}>
                                  ยืนยันรับเงิน
                                </button>
                              </form>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {!active.length && <p className="text-sm text-muted">ยังไม่มีสัญญาเช่าที่กำลังใช้งาน</p>}
              </section>

              <section className="card space-y-3 self-start">
                <h3 className="font-bold text-base">👤 บันทึกผู้เช่าหน้าร้าน (Walk-in)</h3>
                <p className="text-xs text-muted">
                  สำหรับลูกค้าที่มาติดต่อเช่าหน้าร้านโดยตรง (ไม่ต้องสมัครสมาชิกเว็บ) ระบบจะล็อกสถานะ{cat.unit}และสร้างตารางบิลให้ทันที
                </p>
                {vacantPriced.length > 0 ? (
                  <WalkInForm shopId={shop.id} unit={cat.unit} assets={vacantPriced} />
                ) : (
                  <p className="text-xs text-warn bg-brand/15 rounded-xl p-3">
                    ยังไม่มี{cat.unit}ว่างที่ตั้งราคาแล้ว — กรุณาตั้งราคา{cat.unit}ในผังก่อนลงผู้เช่า
                  </p>
                )}
              </section>
            </div>
          </div>
        }
        unitsTab={
          <section className="grid gap-5 md:grid-cols-[1fr_1.5fr]">
            <div className="self-start">
              <AssetForm shopId={shop.id} unit={cat.unit} />
            </div>
            <div className="card self-start">
              <h3 className="font-bold text-base mb-3">รายการ{cat.unit}ทั้งหมด ({assets.length})</h3>
              <ul className="text-sm divide-y divide-line">
                {assets.map((a) => (
                  <li key={a.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <b>{a.code}</b> {a.size && <span className="text-muted">({a.size})</span>}
                      <span className="text-xs text-muted ml-2">
                        {dimText(a.w ?? defaultBox(0).w, a.h ?? defaultBox(0).h)} · {a.price > 0 ? `${baht(a.price)}/${PERIOD[a.period]}` : "ยังไม่ตั้งราคา"}
                      </span>
                    </div>
                    <span className="flex items-center gap-2">
                      <StateBadge state={assetState(a.leases)} />
                      <form action={toggleListed.bind(null, a.id, shop.id)}>
                        <button className={`text-xs rounded-full px-2.5 py-0.5 cursor-pointer font-medium ${a.listed ? "bg-ok/15 text-ok" : "bg-panel2 text-muted"}`} title="คลิกเพื่อสลับ">
                          {a.listed ? "● เปิดให้เช่า" : "ปิดอยู่"}
                        </button>
                      </form>
                      <form action={deleteAsset.bind(null, a.id, shop.id)}>
                        <button className="text-danger text-xs hover:underline cursor-pointer">ลบ</button>
                      </form>
                    </span>
                  </li>
                ))}
                {!assets.length && <p className="text-sm text-muted py-4">ยังไม่มีรายการ — เพิ่มได้จากผังร้านหรือฟอร์มด้านซ้าย</p>}
              </ul>
            </div>
          </section>
        }
        settingsTab={<ShopSettingsForm shop={shop} />}
      />
    </div>
  );
}
