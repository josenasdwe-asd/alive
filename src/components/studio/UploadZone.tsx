"use client";

import { useCallback, useRef, useState } from "react";
import { UploadCloud, ImagePlus, Loader2, Sparkles } from "lucide-react";
import { useAliveStore } from "@/lib/store";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  {
    label: "Paisaje montañoso",
    url: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1200&q=80",
  },
  {
    label: "Retrato",
    url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=1200&q=80",
  },
  {
    label: "Producto",
    url: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1200&q=80",
  },
];

export function UploadZone() {
  const setOriginal = useAliveStore((s) => s.setOriginal);
  const setStatus = useAliveStore((s) => s.setStatus);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast.error("El archivo debe ser una imagen");
        return;
      }
      if (file.size > 12 * 1024 * 1024) {
        toast.error("La imagen es demasiado grande (máx 12MB)");
        return;
      }
      setUploading(true);
      try {
        // Read as data URL FIRST (for instant preview, no waiting for upload)
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
          reader.readAsDataURL(file);
        });

        // Upload to server
        const fd = new FormData();
        fd.append("file", file);
        let res: Response;
        try {
          res = await fetch("/api/upload", { method: "POST", body: fd });
        } catch (fetchErr: any) {
          throw new Error("No se pudo conectar al servidor. Recarga la página e intenta de nuevo.");
        }
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || "Upload failed");

        // Set original with BOTH the server URL and data URL (instant preview)
        setOriginal({
          id: data.id,
          url: data.url,
          width: data.width,
          height: data.height,
          dataUrl,
        });

        toast.success("Imagen cargada — analizando…");
      } catch (err: any) {
        toast.error(err?.message ?? "Error al subir la imagen");
        setStatus("error", err?.message);
      } finally {
        setUploading(false);
      }
    },
    [setOriginal, setStatus]
  );

  const handleExample = useCallback(
    async (url: string, label: string) => {
      setUploading(true);
      try {
        toast.info(`Cargando ejemplo: ${label}…`);
        // Download via server proxy to avoid CORS/NetworkError
        let proxyRes: Response;
        try {
          proxyRes = await fetch(`/api/proxy-image?url=${encodeURIComponent(url)}`);
        } catch (fetchErr: any) {
          throw new Error("No se pudo conectar al servidor. Recarga la página e intenta de nuevo.");
        }
        if (!proxyRes.ok) throw new Error("No se pudo descargar la imagen de ejemplo");
        const blob = await proxyRes.blob();
        const file = new File([blob], "example.jpg", { type: "image/jpeg" });
        await handleFile(file);
      } catch (err: any) {
        toast.error(err?.message ?? "No se pudo cargar el ejemplo");
        setUploading(false);
      }
    },
    [handleFile]
  );

  return (
    <div className="relative w-full">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        className={cn(
          "group relative flex min-h-[340px] flex-col items-center justify-center gap-5 overflow-hidden rounded-2xl border-2 border-dashed p-8 text-center transition-all",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.03]"
        )}
      >
        <div className="aurora opacity-40" />
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />

        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl bg-primary/20 blur-xl" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/30 to-accent/20 ring-1 ring-white/10">
              {uploading ? (
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
              ) : (
                <UploadCloud className="h-7 w-7 text-primary" />
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <h3 className="text-lg font-semibold tracking-tight">
              {uploading ? "Procesando…" : "Sube una imagen para darle vida"}
            </h3>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Arrastra una foto, retrato, paisaje o ilustración. La IA la
              desacoplará en capas con profundidad y la animará sutilmente como
              si estuviera viva.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="gap-2"
            >
              <ImagePlus className="h-4 w-4" />
              Elegir imagen
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
            <span className="text-[11px] text-muted-foreground">
              o prueba un ejemplo:
            </span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                onClick={() => handleExample(ex.url, ex.label)}
                disabled={uploading}
                className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
              >
                {ex.label}
              </button>
            ))}
          </div>

          <p className="flex items-center gap-1.5 pt-1 text-[11px] text-muted-foreground/70">
            <Sparkles className="h-3 w-3" />
            JPG, PNG, WebP · máx 12MB · se procesa en tu servidor
          </p>
        </div>
      </div>
    </div>
  );
}
