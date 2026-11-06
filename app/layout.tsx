import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gritroom",
  description: "Next.js on Cloudflare Workers with D1 and R2",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
