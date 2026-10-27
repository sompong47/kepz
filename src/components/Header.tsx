import Link from "next/link";
import { getUser } from "@/lib/auth";
import { logout } from "@/lib/actions";
import { Wordmark } from "./Brand";

export default async function Header() {
  const u = await getUser();
  return (
    <header className="border-b border-line bg-bg/95 backdrop-blur sticky top-0 z-20">
      <div className="mx-auto max-w-6xl px-3 sm:px-5 h-14 flex items-center justify-between gap-2">
        <Link href="/" aria-label="kepz หน้าแรก" className="shrink-0"><Wordmark size={26} /></Link>
        <nav className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
          {u ? (
            <>
              {u.role === "ADMIN" && <Link href="/admin" className="btn-ghost !py-1.5 !px-2.5">แอดมิน</Link>}
              <Link href="/seller" className="btn-ghost !py-1.5 !px-2.5">🏠 ผัง/ร้านของฉัน</Link>
              <Link href="/seller/shops/new" className="btn !py-1.5 !px-3 hidden sm:inline-flex">＋ สร้างผังใหม่</Link>
              <form action={logout}><button className="btn-ghost !py-1.5 !px-2.5 text-muted">ออก</button></form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost !py-1.5">เข้าสู่ระบบ</Link>
              <Link href="/register" className="btn !py-1.5">สมัครใช้งาน</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
