import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TempoMPP — Machine Payments Dashboard",
  description:
    "Real-time dashboard tracking machine-to-machine payments on the Tempo blockchain via the MPP protocol.",
  openGraph: {
    title: "TempoMPP — Machine Payments Dashboard",
    description:
      "The machine economy is being built. Watch it happen.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TempoMPP",
    description:
      "Real-time machine payments on Tempo. Watch the agentic economy pulse.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-zinc-950 text-zinc-50 antialiased">
        {/* Background effects */}
        <div className="bg-orb-violet" />
        <div className="bg-orb-blue" />
        {children}
      </body>
    </html>
  );
}
