import type { Metadata } from "next";
import { Sarabun, Taviraj } from "next/font/google";
import "./globals.css";

const sarabun = Sarabun({
  variable: "--font-sarabun",
  subsets: ["latin", "thai"],
  weight: ["300", "400", "500", "600", "700"],
});

const taviraj = Taviraj({
  variable: "--font-taviraj",
  subsets: ["latin", "thai"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "NNPC Daily Expense",
  description:
    "Minimal one-day expense reimbursement prototype backed by Next.js and Supabase email/password auth.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sarabun.variable} ${taviraj.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
