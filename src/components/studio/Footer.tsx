"use client";

import { Heart } from "lucide-react";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-white/5 glass-strong">
      <div className="mx-auto flex max-w-[1600px] flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:px-6">
        <p className="flex items-center gap-1.5">
          <span className="font-medium text-foreground">Alive</span>
          <span>·</span>
          <span>Desacopla imágenes en capas con IA y dales vida</span>
        </p>
        <p className="flex items-center gap-1.5">
          Hecho con
          <Heart className="h-3 w-3 fill-primary text-primary" />
          usando VLM, image-edit, WebGL2 y SVG filters
        </p>
      </div>
    </footer>
  );
}
