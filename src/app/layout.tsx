import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";

export const metadata: Metadata = { title: "kepz. — ระบบจัดการเช่า", description: "แพลตฟอร์มจัดการห้องเก็บของ ที่จอดรถ แผงตลาด รถเช่า เรือเช่า" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="font-sans antialiased min-h-screen">
        <Header />
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
