import type { Metadata } from "next";
import { Inter, Roboto } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DSS KAS DAERAH - BPKAD Kab. Kepulauan Aru",
  description: "Sistem Pendukung Keputusan Pengeluaran Kas Daerah & Informasi Kearsipan Elektronik",
};

import MainLayout from "@/components/MainLayout";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import AIChatBubble from "@/components/AIChatBubble";
import { ViewTransitions } from "next-view-transitions";

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-sans",
  display: "swap",
});


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={cn("scroll-smooth", roboto.variable, inter.variable)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `
            (function() {
              try {
                var theme = localStorage.getItem('theme');
                if (theme === 'dark') {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch (e) {}
            })();
          `
        }} />
      </head>
      <body
        className="font-sans antialiased min-h-screen selection:bg-brand/10 selection:text-brand tabular-nums tracking-tight"
        suppressHydrationWarning
      >
          <ViewTransitions>
            <MainLayout>{children}</MainLayout>
          </ViewTransitions>
          <Toaster position="top-center" richColors />
          <AIChatBubble />
      </body>
    </html>
  );
}
