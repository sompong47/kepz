import Link from "next/link";
import { getUser } from "@/lib/auth";
import { demoQuickLogin, logout } from "@/lib/actions";
import { Wordmark } from "./Brand";

export default async function Header() {
  const u = await getUser();
  return (
    <header className="border-b border-line bg-bg/90 backdrop-blur sticky top-0 z-20">
      <div className="bg-ink text-white text-xs">
        <div className="mx-auto max-w-6xl px-4 py-1.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-brand text-ink px-2 py-0.5 text-[10px] font-bold">DEMO MODE</span>
            <span className="text-white/85">
              {u ? (
                <>กำลังทดสอบในฐานะ: <b className="text-brand">{u.name}</b> ({u.email})</>
              ) : (
                <>สลับบทบาทเพื่อทดสอบระบบได้ในคลิกเดียว:</>
              )}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <form action={demoQuickLogin.bind(null, "seller@kepz.test", "/seller")}>
              <button className={`rounded-lg px-2.5 py-0.5 text-[11px] font-medium transition cursor-pointer ${u?.email === "seller@kepz.test" ? "bg-brand text-ink font-bold" : "bg-white/15 hover:bg-white/25 text-white"}`}>
                🏪 เจ้าของร้าน
              </button>
            </form>
            <form action={demoQuickLogin.bind(null, "admin@kepz.test", "/admin")}>
              <button className={`rounded-lg px-2.5 py-0.5 text-[11px] font-medium transition cursor-pointer ${u?.email === "admin@kepz.test" ? "bg-brand text-ink font-bold" : "bg-white/15 hover:bg-white/25 text-white"}`}>
                🛡️ แอดมิน
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
        <Link href="/" aria-label="kepz หน้าแรก"><Wordmark /></Link>
        <nav className="flex items-center gap-2 text-sm">
          {u ? (
            <>
              {u.role === "ADMIN" && <Link href="/admin" className="btn-ghost">แอดมิน</Link>}
              <Link href="/seller" className="btn-ghost">🏠 ร้าน/สถานที่ของฉัน</Link>
              <form action={logout}><button className="btn-ghost">ออก</button></form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost">เข้าสู่ระบบ</Link>
              <Link href="/register" className="btn">สมัครสมาชิก</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
