import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ScanProvider } from "@/components/scan-context";
import { ScanOverlay } from "@/components/scan-overlay";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Master Brand Monitor",
  description: "Markenrecht-Monitoring für die Marke MASTER im Immobilienkontext",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={inter.variable}>
      <body>
        <ScanProvider>
          {children}
          <ScanOverlay />
        </ScanProvider>
      </body>
    </html>
  );
}
