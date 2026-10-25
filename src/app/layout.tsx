import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { BRAND_PIGMENTS } from "@/lib/visualizer/types";
import "./globals.css";

const display = localFont({
  src: "./fonts/Unbounded-Variable.ttf",
  variable: "--font-unbounded",
  declarations: [{ prop: "font-family", value: "Unbounded" }],
  weight: "400 600",
  style: "normal",
  display: "swap",
});

const mono = localFont({
  src: [
    { path: "./fonts/DMMono-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/DMMono-Medium.ttf", weight: "500", style: "normal" },
  ],
  variable: "--font-dm-mono",
  declarations: [{ prop: "font-family", value: "DM Mono" }],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AV/01 — Audio Visualizer",
  description:
    "A local-first signal instrument with five scientifically grounded audio views and controlled reference signals.",
  applicationName: "AV/01 Audio Visualizer",
  keywords: [
    "audio visualizer",
    "music visualizer",
    "Web Audio",
    "real-time graphics",
    "audio reactive",
    "creative coding",
  ],
  authors: [{ name: "Audio Visualizer" }],
  category: "music",
  openGraph: {
    title: "AV/01 — Five views. One signal.",
    description: "A real-time visual instrument with controlled, locally generated audio references.",
    type: "website",
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: BRAND_PIGMENTS.reference,
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
