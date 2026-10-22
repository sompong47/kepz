/**
 * โลโก้ KEPZ: ตัว K เส้นหนาปลายมน + ช่องสี่เหลี่ยมสีขาวในร่องของ K = "พื้นที่ว่างให้เช่า"
 * onBrand = ใช้บนพื้นเหลือง (กรอบดำ ตัว K เหลือง)
 */
export function LogoMark({ size = 36, onBrand = false }: { size?: number; onBrand?: boolean }) {
  const tile = onBrand ? "#111111" : "#FFC700", ink = onBrand ? "#FFC700" : "#111111";
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <rect width="48" height="48" rx="12" fill={tile} />
      <g stroke={ink} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M14 12v24" />
        <path d="M34 12 21.5 24 34 36" />
      </g>
      <rect x="30" y="20.5" width="7" height="7" rx="1.8" fill="#fff" />
    </svg>
  );
}

/** โลโก้เต็ม: สัญลักษณ์ + "kepz" ตัวเล็ก ปิดท้ายด้วยจุดสี่เหลี่ยม (= ช่องบนผัง) */
export function Wordmark({ tagline = false, onBrand = false, mark = true, size = 30 }: { tagline?: boolean; onBrand?: boolean; mark?: boolean; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      {mark && <LogoMark size={size} onBrand={onBrand} />}
      <span className="leading-none">
        <span className="flex items-end font-bold tracking-tight text-ink" style={{ fontSize: size * 0.9 }}>
          kepz
          <i className={`inline-block rounded-[2px] ml-0.5 ${onBrand ? "bg-ink" : "bg-brand"}`} style={{ width: size * 0.2, height: size * 0.2, marginBottom: size * 0.12 }} />
        </span>
        {tagline && <span className="block font-medium tracking-[0.22em] text-ink2 mt-1" style={{ fontSize: Math.max(8, size * 0.28) }}>RENTAL SPACE PLATFORM</span>}
      </span>
    </span>
  );
}

const PATHS = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  chat: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M8 9h8M8 13h5" /></>,
  key: <><circle cx="7.5" cy="15.5" r="4.5" /><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3" /></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  headset: <><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" /></>,
};
export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[name]}
    </svg>
  );
}

/** ไอคอนในวงกลมสีเหลือง */
export function IconBadge({ name, size = 56 }: { name: IconName; size?: number }) {
  return (
    <span className="grid place-items-center rounded-full bg-brand text-ink shrink-0" style={{ width: size, height: size }}>
      <Icon name={name} size={size * 0.45} />
    </span>
  );
}
