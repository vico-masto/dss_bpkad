import type { Metadata } from "next";
import { Inter, Geist, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
});

export const metadata: Metadata = {
  title: "DSS KAS DAERAH - BPKAD Kab. Kepulauan Aru",
  description: "Sistem Pendukung Keputusan Pengeluaran Kas Daerah & Informasi Kearsipan Elektronik",
};

import MainLayout from "@/components/MainLayout";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import AIChatBubble from "@/components/AIChatBubble";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={cn("font-sans", geist.variable, plusJakartaSans.variable)} suppressHydrationWarning>
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
        className={`${inter.variable} ${plusJakartaSans.variable} font-sans antialiased min-h-screen selection:bg-brand/10 selection:text-brand tabular-nums tracking-tight`}
        suppressHydrationWarning
      >
          <MainLayout>{children}</MainLayout>
          <Toaster position="top-center" richColors />
          <AIChatBubble />
      </body>
    </html>
  );
}
