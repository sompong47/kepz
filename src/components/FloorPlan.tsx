"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { addShape, saveLayout, updateAsset, deleteAsset, markPaid } from "@/lib/actions";
import { BILLING, CANVAS, PERIOD, STATE_CLASS, STATE_LABEL, baht, fmtDate, type AssetState } from "@/lib/domain";
import type { FPAsset } from "@/lib/floor";
import { RentForm } from "./Forms";

type Mode = "move" | "nw" | "ne" | "sw" | "se";
const snap = (n: number) => Math.round(n / CANVAS.grid) * CANVAS.grid;
const FILL: Record<AssetState, string> = { VACANT: "#4b5563", OCCUPIED: "#ffc800", EXPIRING: "#e08e0b", PENDING: "#0ea5e9" };

export default function FloorPlan({ shopId, assets, unit, editable, canRent }: { shopId: string; assets: FPAsset[]; unit: string; editable?: boolean; canRent?: boolean }) {
  const [items, setItems] = useState(assets);
  const [sel, setSel] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [saving, setSaving] = useState<"" | "saving" | "saved">("");
  const [scale, setScale] = useState(1);
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; mode: Mode; sx: number; sy: number; o: FPAsset } | null>(null);
  const [, start] = useTransition();

  useEffect(() => setItems(assets), [assets]);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / CANVAS.w)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const patch = (id: string, p: Partial<FPAsset>) => setItems((l) => l.map((a) => (a.id === id ? { ...a, ...p } : a)));
  const persist = (a: FPAsset) => {
    setSaving("saving");
    saveLayout(shopId, a.id, a).then(() => setSaving("saved"));
  };

  const down = (e: React.PointerEvent, a: FPAsset, mode: Mode) => {
    setSel(a.id);
    if (!edit) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: a.id, mode, sx: e.clientX, sy: e.clientY, o: a };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / scale, dy = (e.clientY - d.sy) / scale;
    const { x, y, w, h } = d.o;
    let n = { x, y, w, h };
    if (d.mode === "move") n = { x: snap(x + dx), y: snap(y + dy), w, h };
    else {
      const left = d.mode.includes("w"), top = d.mode.includes("n");
      const nw = Math.max(30, snap(left ? w - dx : w + dx)), nh = Math.max(30, snap(top ? h - dy : h + dy));
      n = { x: left ? x + w - nw : x, y: top ? y + h - nh : y, w: nw, h: nh };
    }
    n.x = Math.min(Math.max(0, n.x), CANVAS.w - n.w);
    n.y = Math.min(Math.max(0, n.y), CANVAS.h - n.h);
    patch(d.id, n);
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (d) persist(items.find((a) => a.id === d.id)!);
  };

  const add = (shape: "RECT" | "CIRCLE") =>
    start(async () => {
      const id = await addShape(shopId, shape);
      setSel(id);
    });
  const toggleShape = (a: FPAsset) => {
    const shape = a.shape === "RECT" ? "CIRCLE" : "RECT";
    patch(a.id, { shape });
    persist({ ...a, shape });
  };

  const cur = items.find((a) => a.id === sel) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {editable && (
          <>
            <button className={edit ? "btn" : "btn-ghost"} onClick={() => setEdit(!edit)}>{edit ? "✓ เสร็จสิ้นการแก้ไขผัง" : "✎ แก้ไขผัง"}</button>
            {edit && (
              <>
                <button className="btn-ghost" onClick={() => add("RECT")}>▭ + สี่เหลี่ยม</button>
                <button className="btn-ghost" onClick={() => add("CIRCLE")}>◯ + วงกลม</button>
                <span className="text-xs text-slate-400">ลากเพื่อย้าย · ลากมุมเพื่อปรับขนาด {saving === "saving" ? "· กำลังบันทึก…" : saving === "saved" ? "· บันทึกแล้ว ✓" : ""}</span>
              </>
            )}
          </>
        )}
        <div className="ml-auto flex flex-wrap gap-3 text-xs text-slate-400">
          {(Object.keys(STATE_LABEL) as AssetState[]).map((k) => (
            <span key={k} className="flex items-center gap-1.5"><i className={`inline-block size-2.5 rounded-full ${STATE_CLASS[k].split(" ")[0]}`} />{STATE_LABEL[k]}</span>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div ref={wrap} className="rounded-2xl border border-line overflow-hidden bg-[#111318]" style={{ height: CANVAS.h * scale }}>
          <div
            onPointerDown={() => setSel(null)}
            onPointerMove={move}
            onPointerUp={up}
            className="relative origin-top-left touch-none select-none"
            style={{
              width: CANVAS.w, height: CANVAS.h, transform: `scale(${scale})`,
              backgroundImage: edit ? "linear-gradient(#22252c 1px,transparent 1px),linear-gradient(90deg,#22252c 1px,transparent 1px)" : "none",
              backgroundSize: `${CANVAS.grid * 2}px ${CANVAS.grid * 2}px`,
            }}
          >
            {items.map((a) => {
              const on = a.id === sel;
              return (
                <div
                  key={a.id}
                  onPointerDown={(e) => { e.stopPropagation(); down(e, a, "move"); }}
                  className={`absolute flex flex-col items-center justify-center text-black font-semibold leading-tight ${edit ? "cursor-move" : "cursor-pointer"}`}
                  style={{
                    left: a.x, top: a.y, width: a.w, height: a.h, background: FILL[a.state], borderRadius: a.shape === "CIRCLE" ? "9999px" : 10,
                    color: a.state === "VACANT" ? "#e5e7eb" : "#000", outline: on ? "3px solid #fff" : "none", outlineOffset: 2,
                  }}
                >
                  <span style={{ fontSize: Math.max(11, Math.min(18, a.w / 5)) }}>{a.code}</span>
                  {a.h >= 50 && a.size && <span className="text-[11px] font-normal opacity-80">{a.size}</span>}
                  {edit && on && (["nw", "ne", "sw", "se"] as const).map((m) => (
                    <span
                      key={m}
                      onPointerDown={(e) => down(e, a, m)}
                      className="absolute size-3.5 rounded-sm bg-white border-2 border-black"
                      style={{ [m.includes("n") ? "top" : "bottom"]: -7, [m.includes("w") ? "left" : "right"]: -7, cursor: m === "nw" || m === "se" ? "nwse-resize" : "nesw-resize" }}
                    />
                  ))}
                </div>
              );
            })}
            {!items.length && <p className="absolute inset-0 grid place-items-center text-slate-500">{editable ? "กด “แก้ไขผัง” แล้วเพิ่มสี่เหลี่ยม/วงกลมได้เลย" : "ยังไม่มีผัง"}</p>}
          </div>
        </div>

        <Panel key={cur?.id ?? "none"} shopId={shopId} a={cur} unit={unit} editable={!!editable} edit={edit} canRent={!!canRent} onShape={toggleShape} onDeleted={() => setSel(null)} />
      </div>
    </div>
  );
}

function Panel({ shopId, a, unit, editable, edit, canRent, onShape, onDeleted }: {
  shopId: string; a: FPAsset | null; unit: string; editable: boolean; edit: boolean; canRent: boolean; onShape: (a: FPAsset) => void; onDeleted: () => void;
}) {
  const [st, act, pending] = useActionState(updateAsset.bind(null, shopId, a?.id ?? ""), undefined);
  if (!a) return <div className="card text-sm text-slate-400">แตะ{unit}ในผังเพื่อดูรายละเอียด สถานะ สัญญา และการชำระเงิน</div>;
  const l = a.lease;
  return (
    <div className="card space-y-3 text-sm self-start">
      <div className="flex items-center justify-between">
        <div className="text-xl font-bold">{a.code} <span className="text-sm font-normal text-slate-400">{a.size}</span></div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_CLASS[a.state]}`}>{STATE_LABEL[a.state]}</span>
      </div>
      <div className="text-brand font-semibold">{a.price > 0 ? <>{baht(a.price)} <span className="text-slate-400 font-normal">/ {PERIOD[a.period]}</span></> : <span className="text-slate-400 font-normal">ยังไม่ตั้งราคา</span>}</div>
      {a.note && <p className="text-slate-400">{a.note}</p>}

      {l ? (
        <div className="space-y-2 border-t border-line pt-3">
          <div><span className="text-slate-400">ผู้เช่า:</span> {l.tenant} {l.phone && <span className="text-slate-400">({l.phone})</span>}</div>
          <div><span className="text-slate-400">สัญญา:</span> {fmtDate(l.start)} – {fmtDate(l.end)}</div>
          <div><span className="text-slate-400">รอบชำระ:</span> {BILLING[l.billing as keyof typeof BILLING]}</div>
          <div className="space-y-1">
            {l.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-panel2 px-2.5 py-1.5 text-xs">
                <span>{fmtDate(p.due)} · {baht(p.amount)}</span>
                {p.paid ? <span className="text-emerald-400">ชำระแล้ว</span> : editable ? (
                  <form action={markPaid.bind(null, p.id)}><button className={`font-semibold ${p.due < Date.now() ? "text-red-400" : "text-brand"}`}>ยืนยันรับเงิน</button></form>
                ) : <span className="text-slate-400">รอชำระ</span>}
              </div>
            ))}
          </div>
        </div>
      ) : a.endDate ? (
        <div className="border-t border-line pt-3 text-slate-400">มีผู้เช่า · สัญญาถึง {fmtDate(a.endDate)}</div>
      ) : null}

      {canRent && a.price > 0 && (
        <details className="border-t border-line pt-3"><summary className="btn list-none w-full">ขอเช่า{unit}นี้</summary><RentForm assetId={a.id} period={a.period} /></details>
      )}

      {editable && edit && (
        <form action={act} className="space-y-2 border-t border-line pt-3">
          <div className="grid grid-cols-2 gap-2">
            <label><span className="label">รหัส/ชื่อ</span><input name="code" defaultValue={a.code} required className="input" /></label>
            <label><span className="label">ขนาด</span><input name="size" defaultValue={a.size ?? ""} className="input" /></label>
            <label><span className="label">ราคา (บาท)</span><input name="price" type="number" min={0} defaultValue={a.price} className="input" /></label>
            <label><span className="label">ต่อ</span><select name="period" defaultValue={a.period} className="input"><option value="MONTH">เดือน</option><option value="DAY">วัน</option></select></label>
          </div>
          <label><span className="label">หมายเหตุ</span><input name="note" defaultValue={a.note ?? ""} className="input" /></label>
          {st?.error && <p className="text-red-400 text-xs">{st.error}</p>}
          <div className="flex flex-wrap gap-2">
            <button className="btn" disabled={pending}>บันทึก</button>
            <button type="button" className="btn-ghost" onClick={() => onShape(a)}>{a.shape === "RECT" ? "เปลี่ยนเป็นวงกลม" : "เปลี่ยนเป็นสี่เหลี่ยม"}</button>
            <button type="submit" formAction={async () => { await deleteAsset(a.id, shopId); onDeleted(); }} className="btn-ghost !text-red-400" onClick={(e) => { if (!confirm(`ลบ ${a.code}?`)) e.preventDefault(); }}>ลบ</button>
          </div>
        </form>
      )}
    </div>
  );
}
