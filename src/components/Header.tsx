import Link from "next/link";
import { getUser } from "@/lib/auth";
import { logout } from "@/lib/actions";
import { Wordmark } from "./Brand";

export default async function Header() {
  const u = await getUser();
  return (
    <header className="border-b border-line bg-bg/85 backdrop-blur sticky top-0 z-20">
      <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
        <Link href="/" aria-label="kepz หน้าแรก"><Wordmark /></Link>
        <nav className="flex items-center gap-2 text-sm">
          {u ? (
            <>
              {u.role === "ADMIN" && <Link href="/admin" className="btn-ghost">แอดมิน</Link>}
              <Link href="/tenant" className="btn-ghost">การเช่าของฉัน</Link>
              <Link href="/seller" className="btn-ghost">ร้านของฉัน</Link>
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
