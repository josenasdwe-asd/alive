"use client";

import { useAliveStore } from "@/lib/store";
import { Header } from "@/components/studio/Header";
import { Footer } from "@/components/studio/Footer";
import { Landing } from "@/components/studio/Landing";
import { Studio } from "@/components/studio/Studio";

export default function Home() {
  const status = useAliveStore((s) => s.status);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        {status === "idle" ? <Landing /> : <Studio />}
      </main>
      <Footer />
    </div>
  );
}
