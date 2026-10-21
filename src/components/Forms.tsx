"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { login, register, createShop, addAsset, requestLease, type FormState } from "@/lib/actions";
import { CATEGORIES, BILLING, baht, buildPayments, daysBetween, fmtDate } from "@/lib/domain";

function Err({ s }: { s: FormState }) {
  return s?.error ? <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{s.error}</p> : null;
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}</label>;
}

export function LoginForm() {
  const [st, act, pending] = useActionState(login, undefined);
  return (
    <form action={act} className="card space-y-4 max-w-md mx-auto">
      <h1 className="text-xl font-bold">เข้าสู่ระบบ</h1>
      <F label="อีเมล"><input name="email" type="email" required className="input" /></F>
      <F label="รหัสผ่าน"><input name="password" type="password" required className="input" /></F>
      <Err s={st} />
      <button className="btn w-full" disabled={pending}>{pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}</button>
      <p className="text-sm text-muted text-center">ยังไม่มีบัญชี? <Link href="/register" className="text-brand-ink">สมัครสมาชิก</Link></p>
    </form>
  );
}

export function RegisterForm() {
  const [st, act, pending] = useActionState(register, undefined);
  return (
    <form action={act} className="card space-y-4 max-w-md mx-auto">
      <h1 className="text-xl font-bold">สมัครสมาชิก</h1>
      <F label="ชื่อ"><input name="name" required className="input" /></F>
      <F label="อีเมล"><input name="email" type="email" required className="input" /></F>
      <F label="เบอร์โทร"><input name="phone" className="input" /></F>
      <F label="รหัสผ่าน (6 ตัวขึ้นไป)"><input name="password" type="password" required minLength={6} className="input" /></F>
      <Err s={st} />
      <button className="btn w-full" disabled={pending}>{pending ? "กำลังสมัคร…" : "สมัครสมาชิก"}</button>
    </form>
  );
}

export function ShopForm() {
  const [st, act, pending] = useActionState(createShop, undefined);
  return (
    <form action={act} className="card space-y-4 max-w-xl">
      <F label="ประเภทธุรกิจ">
        <select name="category" required className="input" defaultValue="">
          <option value="" disabled>เลือก…</option>
          {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
        </select>
      </F>
      <F label="ชื่อร้าน"><input name="name" required className="input" placeholder="เช่น kepz Storage" /></F>
      <F label="ที่ตั้ง"><input name="location" className="input" /></F>
      <F label="เบอร์ติดต่อ"><input name="phone" className="input" /></F>
      <F label="รายละเอียด"><textarea name="description" rows={3} className="input" /></F>
      <Err s={st} />
      <button className="btn" disabled={pending}>{pending ? "กำลังสร้าง…" : "สร้างร้าน"}</button>
    </form>
  );
}

export function AssetForm({ shopId, unit }: { shopId: string; unit: string }) {
  const [st, act, pending] = useActionState(addAsset.bind(null, shopId), undefined);
  return (
    <form action={act} className="card space-y-3">
      <h3 className="font-semibold">เพิ่ม{unit}</h3>
      <div className="grid grid-cols-2 gap-3">
        <F label="รหัส/ชื่อ"><input name="code" required placeholder="A01" className="input" /></F>
        <F label="ป้ายขนาด"><input name="size" placeholder="XS, S, M, L…" className="input" /></F>
        <F label="กว้าง (เมตร)"><input name="wm" type="number" min={1} step={0.5} placeholder="5" className="input" /></F>
        <F label="ยาว (เมตร)"><input name="hm" type="number" min={1} step={0.5} placeholder="3.5" className="input" /></F>
        <F label="ราคา (บาท)"><input name="price" type="number" min={1} required className="input" /></F>
        <F label="คิดราคาต่อ">
          <select name="period" className="input"><option value="MONTH">เดือน</option><option value="DAY">วัน</option></select>
        </F>
      </div>
      <F label="หมายเหตุ"><input name="note" className="input" /></F>
      <Err s={st} />
      <button className="btn" disabled={pending}>เพิ่ม</button>
    </form>
  );
}

export type BusyRange = { start: number; end: number };

/** ฟอร์มขอเช่า: คำนวณยอดให้ทันที และแสดงช่วงที่มีผู้เช่าแล้ว */
export function RentForm({ assetId, price, period, busy = [] }: { assetId: string; price: number; period: "DAY" | "MONTH"; busy?: BusyRange[] }) {
  const [st, act, pending] = useActionState(requestLease.bind(null, assetId), undefined);
  const today = new Date().toISOString().slice(0, 10);
  const [v, setV] = useState({ start: "", end: "", billing: "MONTH" as "MONTH" | "HALF_YEAR" | "YEAR" });
  const s = v.start ? new Date(v.start) : null, e = v.end ? new Date(v.end) : null;
  const valid = s && e && +e > +s;
  const clash = valid && busy.some((r) => r.start < +e! && r.end > +s!);
  const pays = valid ? buildPayments({ price, period, start: s!, end: e!, billing: v.billing }) : [];
  const total = pays.reduce((n, p) => n + p.amount, 0);
  const upcoming = busy.filter((r) => r.end >= Date.now()).sort((x, y) => x.start - y.start);
  return (
    <form action={act} className="space-y-2 mt-3 border-t border-line pt-3">
      {upcoming.length > 0 && (
        <div className="rounded-lg bg-panel2 px-3 py-2 text-xs">
          <div className="font-medium mb-0.5">ช่วงที่มีผู้เช่าแล้ว</div>
          {upcoming.map((r) => <div key={r.start} className="text-muted">{fmtDate(r.start)} – {fmtDate(r.end)}</div>)}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <F label="วันเริ่ม"><input type="date" name="start" min={today} required className="input" value={v.start} onChange={(x) => setV({ ...v, start: x.target.value })} /></F>
        <F label="วันสิ้นสุด"><input type="date" name="end" min={v.start || today} required className="input" value={v.end} onChange={(x) => setV({ ...v, end: x.target.value })} /></F>
      </div>
      {period === "MONTH" && (
        <F label="รอบชำระเงิน">
          <select name="billing" className="input" value={v.billing} onChange={(x) => setV({ ...v, billing: x.target.value as typeof v.billing })}>
            {Object.entries(BILLING).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </F>
      )}
      {valid && (
        <div className={`rounded-lg px-3 py-2 text-sm ${clash ? "bg-danger/10 text-danger" : "bg-brand/15"}`}>
          {clash ? "ช่วงวันที่นี้ทับกับผู้เช่าคนอื่น" : (
            <>
              <div className="flex justify-between"><span>ยอดรวม</span><b>{baht(total)}</b></div>
              <div className="flex justify-between text-xs text-ink2">
                <span>{period === "DAY" ? `${daysBetween(s!, e!)} วัน × ${baht(price)}` : `${pays.length} งวด`}</span>
                <span>งวดแรก {baht(pays[0]?.amount ?? 0)} · {fmtDate(s!)}</span>
              </div>
            </>
          )}
        </div>
      )}
      <Err s={st} />
      <button className="btn w-full" disabled={pending || !!clash}>{pending ? "กำลังส่ง…" : "ส่งคำขอเช่า"}</button>
      <p className="text-[11px] text-muted text-center">ผู้ให้เช่าจะตรวจสอบและอนุมัติ แล้วระบบจะสร้างตารางชำระเงินให้</p>
    </form>
  );
}
