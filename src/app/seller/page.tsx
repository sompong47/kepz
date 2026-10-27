import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, shops } from "@/db";
import { requireUser } from "@/lib/auth";
import { markPaid } from "@/lib/actions";
import { CATEGORIES, CANVAS, FEATURES, PERIOD, assetState, baht, defaultBox, fmtDate, type AssetState, type Category } from "@/lib/domain";

export const dynamic = "force-dynamic";

const MINI_FILL: Record<AssetState, string> = {
  VACANT: "#ffffff",
  OCCUPIED: "#ffc700",
  EXPIRING: "#fb923c",
  PENDING: "#38bdf8",
};
const MINI_STROKE: Record<AssetState, string> = {
  VACANT: "#16a34a",
  OCCUPIED: "#b45309",
  EXPIRING: "#ea580c",
  PENDING: "#0284c7",
};

export default async function Seller() {
  const u = await requireUser();
  const my = await db.query.shops.findMany({
    where: eq(shops.ownerId, u.id),
    orderBy: desc(shops.createdAt),
    with: {
      floors: true,
      features: true,
      assets: {
        with: {
          leases: {
            with: { tenant: true, payments: true },
          },
        },
      },
    },
  });

  const allAssets = my.flatMap((s) => s.assets.map((a) => ({ ...a, shop: s, state: assetState(a.leases) })));
  const occupiedCount = allAssets.filter((a) => a.state === "OCCUPIED" || a.state === "EXPIRING").length;
  const vacantCount = allAssets.filter((a) => a.state === "VACANT").length;
  const expiringAssets = allAssets.filter((a) => a.state === "EXPIRING");
  const occupancyRate = allAssets.length ? Math.round((occupiedCount / allAssets.length) * 100) : 0;

  // คำนวณรายได้เดือนนี้ + รายได้ประจำต่อเดือนจากสัญญาที่ใช้งานอยู่ + รายการค้างชำระ
  const now = Date.now();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const activeLeases = allAssets.flatMap((a) =>
    a.leases
      .filter((l) => l.status === "ACTIVE")
      .map((l) => ({ ...l, asset: a, shop: a.shop })),
  );
  const allPayments = activeLeases.flatMap((l) =>
    l.payments.map((p) => ({ ...p, lease: l, asset: l.asset, shop: l.shop })),
  );

  const revenueThisMonth = allPayments
    .filter((p) => p.paidAt && +p.paidAt >= monthStart)
    .reduce((sum, p) => sum + p.amount, 0);

  const expectedMonthly = allAssets
    .filter((a) => a.state === "OCCUPIED" || a.state === "EXPIRING")
    .reduce((sum, a) => sum + (a.period === "DAY" ? a.price * 30 : a.price), 0);

  const overduePayments = allPayments
    .filter((p) => !p.paidAt && +p.dueDate < now)
    .sort((a, b) => +a.dueDate - +b.dueDate);

  return (
    <div className="space-y-5">
      {/* 1. Hero Studio Banner สไตล์ Canva (กระชับ รองรับมือถือ) */}
      <section className="relative overflow-hidden rounded-2xl bg-ink text-white p-4 sm:p-6 shadow-md">
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(#ffc700 1.5px, transparent 1.5px)",
            backgroundSize: "20px 20px",
          }}
        />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1 max-w-xl">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-2.5 py-0.5 text-[11px] font-medium text-brand">
              <span>✨ Floor Plan Studio & Space Manager</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              สวัสดี {u.name} 👋
            </h1>
            <p className="text-xs sm:text-sm text-white/75 leading-relaxed">
              ออกแบบผังพื้นที่เช่าสไตล์ Canva · สลับสถานะว่างในคลิกเดียว · ดาวน์โหลดโปสเตอร์ผังร้านและแชร์ลิงก์สดได้ทันที
            </p>
          </div>

          <Link
            href="/seller/shops/new"
            className="btn !py-2.5 !px-4 text-xs sm:text-sm shadow-[0_8px_20px_-5px_rgba(255,199,0,0.45)]"
          >
            ＋ สร้างผังสถานที่ใหม่
          </Link>
        </div>

        {/* แถบทางลัดเริ่มสร้างผังตามประเภทธุรกิจ (เลื่อนแนวนอนบนมือถือได้) */}
        <div className="relative z-10 mt-4 pt-3.5 border-t border-white/10 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <span className="text-[11px] text-white/60 shrink-0 mr-1">เริ่มด่วนจากแม่แบบ:</span>
          {(Object.entries(CATEGORIES) as [Category, (typeof CATEGORIES)[Category]][]).map(([k, v]) => (
            <Link
              key={k}
              href={`/seller/shops/new?c=${k}`}
              className="inline-flex items-center gap-1 rounded-lg bg-white/10 hover:bg-brand hover:text-ink px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition"
            >
              <span>{v.icon}</span>
              <span>{v.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* 2. แผงสรุปภาพรวม (KPI Cards กระชับ 2x2 บนมือถือ, 4 ช่องบนจอใหญ่) */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
        <div className="card !p-3.5 sm:!p-4 flex flex-col justify-between bg-gradient-to-br from-[#fffdf5] to-white border-brand/50">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] sm:text-xs font-semibold text-ink2">💰 รับแล้วเดือนนี้</span>
            <span className="grid place-items-center size-7 rounded-lg bg-brand/25 text-xs font-bold">฿</span>
          </div>
          <div className="mt-1.5">
            <div className="text-xl sm:text-2xl font-extrabold text-ink">{baht(revenueThisMonth)}</div>
            <div className="text-[11px] text-muted mt-0.5 truncate">
              สัญญาปัจจุบัน: <b className="text-ink2">{baht(expectedMonthly)}/ด.</b>
            </div>
          </div>
        </div>

        <div className="card !p-3.5 sm:!p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] sm:text-xs font-semibold text-ink2">📊 อัตราเช่าพื้นที่</span>
            <span className="text-[11px] font-bold rounded-full bg-ok/15 text-ok px-2 py-0.2">{occupancyRate}%</span>
          </div>
          <div className="mt-1.5 space-y-1.5">
            <div className="text-xl sm:text-2xl font-extrabold">
              {occupiedCount} <span className="text-xs font-normal text-muted">/ {allAssets.length} ล็อก</span>
            </div>
            <div className="h-2 w-full rounded-full bg-panel2 overflow-hidden flex">
              <div className="bg-brand h-full transition-all" style={{ width: `${occupancyRate}%` }} />
            </div>
          </div>
        </div>

        <div className="card !p-3.5 sm:!p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] sm:text-xs font-semibold text-ink2">🟢 ว่างพร้อมเช่า</span>
            <span className="grid place-items-center size-7 rounded-lg bg-ok/15 text-ok text-xs font-bold">✓</span>
          </div>
          <div className="mt-1.5">
            <div className="text-xl sm:text-2xl font-extrabold text-ok">{vacantCount}</div>
            <div className="text-[11px] text-muted mt-0.5">
              รวมจาก {my.length} สถานที่
            </div>
          </div>
        </div>

        <div className={`card !p-3.5 sm:!p-4 flex flex-col justify-between ${overduePayments.length || expiringAssets.length ? "border-warn/50 bg-orange-50/40" : ""}`}>
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] sm:text-xs font-semibold text-ink2">🔔 ต้องติดตาม</span>
            <span className="grid place-items-center size-7 rounded-lg bg-orange-500/15 text-warn text-xs font-bold">!</span>
          </div>
          <div className="mt-1.5">
            <div className="flex items-baseline gap-2">
              <div>
                <span className={`text-xl sm:text-2xl font-extrabold ${overduePayments.length ? "text-danger" : "text-ink"}`}>{overduePayments.length}</span>
                <span className="text-[11px] text-muted ml-1">ค้างจ่าย</span>
              </div>
              <div className="h-4 w-px bg-line" />
              <div>
                <span className={`text-lg sm:text-xl font-bold ${expiringAssets.length ? "text-warn" : "text-ink"}`}>{expiringAssets.length}</span>
                <span className="text-[11px] text-muted ml-1">ใกล้หมด</span>
              </div>
            </div>
            <div className="text-[11px] text-muted mt-0.5 truncate">
              {overduePayments.length ? "มีรายการเลยกำหนดด้านล่าง" : "ทุกสัญญาสถานะปกติ"}
            </div>
          </div>
        </div>
      </section>

      {/* 3. รายการแจ้งเตือนด่วน (แสดงเฉพาะเมื่อมีค้างชำระ หรือใกล้หมดสัญญา) */}
      {(overduePayments.length > 0 || expiringAssets.length > 0) && (
        <section className="card !p-5 border-l-4 border-l-orange-500 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-base flex items-center gap-2">
              <span>⚡ รายการที่ต้องจัดการด่วน</span>
              <span className="rounded-full bg-orange-500/15 text-warn px-2.5 py-0.5 text-xs">
                {overduePayments.length + expiringAssets.length} รายการ
              </span>
            </h2>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            {overduePayments.slice(0, 4).map((p) => {
              const tName = p.lease.guestName || p.lease.tenant?.name || "ผู้เช่า";
              return (
                <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-xs">
                  <div>
                    <div className="font-bold text-ink">
                      🔴 ค้างชำระ: {p.shop.name} · ล็อก <span className="underline">{p.asset.code}</span>
                    </div>
                    <div className="text-muted mt-0.5">
                      {tName} · ยอด <b className="text-danger">{baht(p.amount)}</b> (ครบกำหนด {fmtDate(p.dueDate)})
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <form action={markPaid.bind(null, p.id)}>
                      <button className="btn !py-1 !px-2.5 text-xs">✓ รับเงินแล้ว</button>
                    </form>
                    <Link href={`/seller/shops/${p.shop.id}`} className="btn-ghost !py-1 !px-2 text-xs">ดู</Link>
                  </div>
                </div>
              );
            })}

            {expiringAssets.slice(0, 4).map((a) => {
              const active = a.leases.find((l) => l.status === "ACTIVE");
              const tName = active?.guestName || active?.tenant?.name || "ผู้เช่า";
              return (
                <div key={a.id} className="flex items-center justify-between gap-2 rounded-xl border border-orange-300 bg-orange-50/60 px-3.5 py-2.5 text-xs">
                  <div>
                    <div className="font-bold text-ink">
                      🟠 ใกล้หมดสัญญา: {a.shop.name} · ล็อก <span className="underline">{a.code}</span>
                    </div>
                    <div className="text-muted mt-0.5">
                      {tName} · หมดสัญญา {active ? fmtDate(active.endDate) : "-"}
                    </div>
                  </div>
                  <Link href={`/seller/shops/${a.shop.id}/plan`} className="btn-ghost !py-1 !px-2.5 text-xs shrink-0">
                    เปิดดูในผัง →
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 4. ผังและสถานที่ของฉัน (Canva Project Cards พร้อม Live Mini Floor Plan) */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold">🗺️ ผังและสถานที่ของฉัน ({my.length})</h2>
            <p className="text-xs text-muted">คลิก “🎨 เปิดสตูดิโอแต่งผัง” เพื่อออกแบบผัง लากวางโซน หรือดาวน์โหลดรูปผังไปโพสต์</p>
          </div>
          <Link href="/seller/shops/new" className="btn-ghost text-xs sm:text-sm">
            ＋ เพิ่มสถานที่ใหม่
          </Link>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {my.map((s) => {
            const cat = CATEGORIES[s.category];
            const firstFloor = s.floors[0];
            const W = firstFloor?.w ?? CANVAS.w;
            const H = firstFloor?.h ?? CANVAS.h;
            const floorAssets = firstFloor
              ? s.assets.filter((a) => !a.floorId || a.floorId === firstFloor.id)
              : s.assets;
            const floorFeats = firstFloor
              ? s.features.filter((f) => f.floorId === firstFloor.id)
              : s.features;

            const states = s.assets.map((a) => assetState(a.leases));
            const busy = states.filter((x) => x === "OCCUPIED" || x === "EXPIRING").length;
            const vacant = s.assets.length - busy;
            const expiring = states.filter((x) => x === "EXPIRING").length;
            const occPct = s.assets.length ? Math.round((busy / s.assets.length) * 100) : 0;
            const shopMonthly = s.assets
              .filter((_, idx) => states[idx] === "OCCUPIED" || states[idx] === "EXPIRING")
              .reduce((sum, a) => sum + (a.period === "DAY" ? a.price * 30 : a.price), 0);

            return (
              <div
                key={s.id}
                className="card !p-0 overflow-hidden flex flex-col justify-between hover:border-brand hover:shadow-lg transition group"
              >
                <div>
                  {/* พรีวิวผังจำลองสด (Live Mini Floor Plan Canvas) */}
                  <Link
                    href={`/seller/shops/${s.id}/plan`}
                    className="block relative aspect-[16/10] bg-[#faf8f2] border-b border-line overflow-hidden"
                    title="คลิกเพื่อเปิดสตูดิโอแต่งผัง (Canva Mode)"
                  >
                    <svg
                      viewBox={`0 0 ${W} ${H}`}
                      preserveAspectRatio="xMidYMid meet"
                      className="size-full p-3 group-hover:scale-[1.03] transition-transform duration-300"
                    >
                      <rect
                        x={0}
                        y={0}
                        width={W}
                        height={H}
                        rx={20}
                        fill="#ffffff"
                        stroke="#e5e0d0"
                        strokeWidth={4}
                      />
                      {/* วาดโซนและถนนด้านหลัง */}
                      {floorFeats.map((f) => {
                        const isRoad = f.kind === "ROAD";
                        const isWater = f.kind === "WATER";
                        const isGreen = f.kind === "GREEN";
                        const fill = f.color
                          ? `${f.color}25`
                          : isRoad
                            ? "#dcdad2"
                            : isWater
                              ? "#bae6fd"
                              : isGreen
                                ? "#bbf7d0"
                                : "#f3f4f6";
                        return (
                          <rect
                            key={f.id}
                            x={f.x}
                            y={f.y}
                            width={f.w}
                            height={f.h}
                            rx={8}
                            fill={fill}
                            stroke={f.color || "#d4d4d8"}
                            strokeWidth={2}
                          />
                        );
                      })}
                      {/* วาดห้อง/ช่องเช่าตามตำแหน่งจริงและสีสถานะจริง */}
                      {floorAssets.map((a, idx) => {
                        const d = defaultBox(idx);
                        const ax = a.x ?? d.x;
                        const ay = a.y ?? d.y;
                        const aw = a.w ?? d.w;
                        const ah = a.h ?? d.h;
                        const st = assetState(a.leases);
                        return (
                          <g key={a.id}>
                            <rect
                              x={ax}
                              y={ay}
                              width={aw}
                              height={ah}
                              rx={a.shape === "CIRCLE" ? Math.min(aw, ah) / 2 : 8}
                              fill={MINI_FILL[st]}
                              stroke={MINI_STROKE[st]}
                              strokeWidth={3}
                            />
                            {aw >= 55 && ah >= 40 && (
                              <text
                                x={ax + aw / 2}
                                y={ay + ah / 2 + 5}
                                textAnchor="middle"
                                fontSize={Math.min(18, aw / 4)}
                                fontWeight="bold"
                                fill="#111"
                              >
                                {a.code}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </svg>

                    {/* Badge ประเภทธุรกิจมุมซ้ายบน */}
                    <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-white/95 backdrop-blur px-2.5 py-1 text-xs font-semibold shadow-2xs border border-black/5">
                      <span>{cat.icon}</span>
                      <span>{cat.label}</span>
                    </span>

                    {/* ปุ่ม Hover เข้าหน้าสตูดิโอ */}
                    <span className="absolute bottom-2.5 right-2.5 rounded-xl bg-ink/90 text-white px-3 py-1 text-xs font-medium opacity-90 group-hover:bg-brand group-hover:text-ink transition">
                      🎨 แต่งผัง / ดาวน์โหลดรูป →
                    </span>
                  </Link>

                  {/* รายละเอียดร้าน + หลอดสถานะ */}
                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link href={`/seller/shops/${s.id}`} className="font-bold text-lg hover:underline">
                          {s.name}
                        </Link>
                        {s.location && <div className="text-xs text-muted mt-0.5">📍 {s.location}</div>}
                      </div>
                      {!s.active && (
                        <span className="text-xs rounded-full px-2.5 py-0.5 bg-danger/10 text-danger shrink-0">
                          ถูกระงับ
                        </span>
                      )}
                    </div>

                    {/* หลอด Occupancy และสรุปตัวเลข */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span>
                          มีผู้เช่า <b className="text-ink">{busy}</b>/{s.assets.length} {cat.unit} ·{" "}
                          <b className="text-ok">ว่าง {vacant}</b>
                          {expiring > 0 && <span className="text-warn font-medium"> · ใกล้หมด {expiring}</span>}
                        </span>
                        <span className="font-semibold text-ink2">{occPct}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-panel2 overflow-hidden">
                        <div
                          className="h-full bg-brand transition-all"
                          style={{ width: `${occPct}%` }}
                        />
                      </div>
                    </div>

                    {shopMonthly > 0 && (
                      <div className="text-xs text-muted flex items-center justify-between pt-0.5">
                        <span>รายได้ตามสัญญาปัจจุบัน</span>
                        <b className="text-ink">{baht(shopMonthly)}/เดือน</b>
                      </div>
                    )}
                  </div>
                </div>

                {/* แถบปุ่มลัด 3 ปุ่มด้านล่างการ์ด */}
                <div className="px-4 py-3 bg-panel2/50 border-t border-line flex items-center gap-2">
                  <Link
                    href={`/seller/shops/${s.id}/plan`}
                    className="btn !py-1.5 !px-3 text-xs flex-1 justify-center"
                  >
                    🎨 สตูดิโอแต่งผัง
                  </Link>
                  <Link
                    href={`/seller/shops/${s.id}`}
                    className="btn-ghost !py-1.5 !px-3 text-xs bg-white"
                  >
                    📋 จัดการร้าน/บิล
                  </Link>
                  <Link
                    href={`/shops/${s.id}`}
                    title="ดูหน้าลิงก์แชร์สาธารณะ"
                    className="btn-ghost !py-1.5 !px-2.5 text-xs bg-white"
                  >
                    🔗
                  </Link>
                </div>
              </div>
            );
          })}

          {/* การ์ดใบสุดท้าย: ปุ่มสร้างผังร้านใหม่แบบ Dashed Card */}
          <Link
            href="/seller/shops/new"
            className="rounded-2xl border-2 border-dashed border-line hover:border-brand bg-panel/50 hover:bg-brand/5 p-6 flex flex-col items-center justify-center text-center gap-2 min-h-[280px] transition group"
          >
            <div className="size-14 rounded-2xl bg-brand/20 group-hover:bg-brand text-2xl grid place-items-center transition">
              ＋
            </div>
            <div className="font-bold text-base mt-1">สร้างผังสถานที่ใหม่</div>
            <p className="text-xs text-muted max-w-xs">
              เลือกจากแม่แบบสำเร็จรูป (โกดัง, ลานจอดรถ, ตลาดนัด, รถเช่า, ท่าเรือ) หรือเริ่มจากผังว่างแบบ Canva
            </p>
          </Link>
        </div>
      </section>
    </div>
  );
}
