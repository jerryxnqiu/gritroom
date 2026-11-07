import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GritRoom",
  description: "A family learning space for Selective and OC Thinking Skills practice.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
