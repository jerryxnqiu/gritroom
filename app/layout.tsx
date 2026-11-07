import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GritRoom",
  description: "A private family learning space for Selective and OC preparation.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
