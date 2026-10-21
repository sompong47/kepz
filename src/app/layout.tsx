import type { Metadata } from "next";
import { Kanit } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const kanit = Kanit({ subsets: ["thai", "latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-kanit", display: "swap" });

export const metadata: Metadata = { title: "kepz. — ระบบจัดการเช่า", description: "แพลตฟอร์มจัดการห้องเก็บของ ที่จอดรถ แผงตลาด รถเช่า เรือเช่า" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={kanit.variable}>
      <body className="font-sans antialiased min-h-screen flex flex-col">
        <Header />
        <main className="mx-auto w-full max-w-6xl px-4 py-6 flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
