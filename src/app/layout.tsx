import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Heebo, Rubik } from "next/font/google";
import { connection } from "next/server";
import clsx from "clsx";
import "@/styles/globals.css";

const heebo = Heebo({ subsets: ["hebrew", "latin"], variable: "--font-heebo", display: "swap" });
const rubik = Rubik({
  subsets: ["hebrew", "latin"],
  weight: ["500", "700"],
  variable: "--font-rubik",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "ניהול ייעוץ משכנתאות", template: "%s · ניהול ייעוץ משכנתאות" },
  description: "מערכת לניהול לקוחות, תיקי משכנתאות, מסמכים ומשימות.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Render per request, so the scripts of every page carry that request's CSP nonce.
  await connection();

  return (
    <html lang="he" dir="rtl" className={clsx(heebo.variable, rubik.variable)}>
      <body>
        <a className="skip-link" href="#main">
          דלג לתוכן
        </a>
        {children}
      </body>
    </html>
  );
}
