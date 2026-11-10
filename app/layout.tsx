import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "QUORIX — AI Interview Intelligence & Live Board Platform",
  description:
    "Deterministic AI mock interviews and live expert boardroom co-pilot with adaptive question flow, tri-factor rubric scoring, and CV domain coverage analytics.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#FAF8F5] text-[#1A1918] font-sans selection:bg-[#E2DFD6] selection:text-[#1A1918]">
        {children}
      </body>
    </html>
  );
}
