import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { Toaster as SonnerToaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Alive — Image Layer Decomposition & Animation Studio",
  description:
    "Sube una imagen, desacóplala en capas con IA y dale vida con animaciones tipo LSD sutil. Studio profesional para heroes y secciones animadas de máxima calidad.",
  keywords: [
    "image layers",
    "parallax animation",
    "depth map",
    "alive image",
    "hero animation",
    "image decomposition",
    "AI image",
  ],
  authors: [{ name: "Alive Studio" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Alive — Image Layer Decomposition & Animation Studio",
    description:
      "Desacopla imágenes en capas con IA y dales vida con animaciones soñadoras.",
    url: "https://chat.z.ai",
    siteName: "Alive",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        {children}
        <SonnerToaster />
      </body>
    </html>
  );
}
