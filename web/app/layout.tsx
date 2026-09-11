import type { Metadata } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { CECConnection } from "@/components/cec/Connection";
import { Shell } from "@/components/Shell";
import "./globals.css";

const sans = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-figtree",
  display: "swap",
});

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-bricolage",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Club OS",
  description: "The record for college clubs.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body>
        <CECConnection>
          <Shell>{children}</Shell>
        </CECConnection>
      </body>
    </html>
  );
}
