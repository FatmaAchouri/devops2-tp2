import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TP2 DevOps 2",
  description: "Next.js + Strapi + PostgreSQL avec Docker Compose",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
