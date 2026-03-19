import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Machine Payments — Tempo",
  description:
    "Real-time dashboard tracking machine-to-machine payments on the Tempo blockchain via the MPP protocol.",
  openGraph: {
    title: "Machine Payments — Tempo",
    description:
      "Autonomous agents deserve autonomous payments.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Machine Payments — Tempo",
    description:
      "Real-time machine payments on Tempo.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
