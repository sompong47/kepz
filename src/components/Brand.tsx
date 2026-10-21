/** โลโก้ + ไอคอนตาม Brand Guide (แว่นขยายสีเหลืองพร้อมเส้นความเร็ว) */

export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size * 1.35} height={size} viewBox="0 0 54 40" aria-hidden>
      <g stroke="#111" strokeWidth="3.2" strokeLinecap="round">
        <line x1="3" y1="13" x2="11" y2="13" />
        <line x1="1" y1="19" x2="11" y2="19" />
        <line x1="5" y1="25" x2="11" y2="25" />
      </g>
      <line x1="40" y1="30" x2="50" y2="38" stroke="#111" strokeWidth="5" strokeLinecap="round" />
      <circle cx="29" cy="19" r="14" fill="#FFC700" stroke="#111" strokeWidth="4" />
      {/* กล่อง/ห้องเก็บของ */}
      <path d="M22 17.5 29 14l7 3.5v7L29 28l-7-3.5z" fill="#fff" stroke="#111" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M22 17.5 29 21l7-3.5M29 21v7" fill="none" stroke="#111" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark({ tagline = false }: { tagline?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <LogoMark size={30} />
      <span className="leading-none">
        <span className="block text-2xl font-bold tracking-[0.08em] text-ink">KEPZ</span>
        {tagline && <span className="block text-[9px] font-medium tracking-[0.2em] text-ink2">RENTAL SPACE PLATFORM</span>}
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
