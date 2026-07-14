"use client";

import { useMemo, useState } from "react";
import { Code2, Copy, Check, Download } from "lucide-react";
import { useAliveStore } from "@/lib/store";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { generateHtml, generateReact, generate2p5d, type ExportFormat } from "@/lib/export-code";
import { VideoExport } from "./VideoExport";
import { PRESET_MAP } from "@/lib/presets";

export function ExportPanel() {
  const [format, setFormat] = useState<ExportFormat>("html");
  const [copied, setCopied] = useState(false);

  const animation = useAliveStore((s) => s.animation);
  const layers = useAliveStore((s) => s.layers);
  const originalUrl = useAliveStore((s) => s.originalUrl);
  const backgroundUrl = useAliveStore((s) => s.backgroundUrl);
  const depthMapUrl = useAliveStore((s) => s.depthMapUrl);
  const width = useAliveStore((s) => s.width);
  const height = useAliveStore((s) => s.height);

  const code = useMemo(() => {
    if (!originalUrl) return "";
    const params = {
      config: animation,
      layers,
      originalUrl,
      backgroundUrl,
      depthUrl: depthMapUrl,
      foregroundUrl: layers.find((l) => l.role === "foreground")?.url,
      width: width || 1024,
      height: height || 640,
    };
    return format === "html"
      ? generateHtml(params)
      : format === "react"
        ? generateReact(params)
        : generate2p5d(params); // json
  }, [format, animation, layers, originalUrl, backgroundUrl, depthMapUrl, width, height]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Código copiado al portapapeles");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  const handleDownload = () => {
    const ext = format === "html" ? "html" : format === "react" ? "tsx" : "json";
    const mime = format === "html" ? "text/html" : "application/json";
    const blob = new Blob([code], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `alive-${animation.preset}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Descargado alive-${animation.preset}.${ext}`);
  };

  const presetName = PRESET_MAP[animation.preset]?.name ?? "";

  return (
    <section className="glass rounded-xl p-3">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Code2 className="h-4 w-4" />
          </span>
          <h3 className="text-sm font-medium tracking-tight">Exportar</h3>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDownload}
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
          >
            <Download className="h-3 w-3" />
            <span className="hidden sm:inline">Descargar</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopy}
            className="h-7 gap-1.5 px-2 text-xs"
          >
            {copied ? (
              <Check className="h-3 w-3 text-primary" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            {copied ? "Copiado" : "Copiar"}
          </Button>
          <VideoExport />
        </div>
      </header>

      <div className="mb-3 grid w-full grid-cols-3 gap-1 rounded-lg border border-white/5 bg-white/[0.02] p-1">
        <button
          onClick={() => setFormat("html")}
          className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
            format === "html" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          HTML
        </button>
        <button
          onClick={() => setFormat("react")}
          className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
            format === "react" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          React
        </button>
        <button
          onClick={() => setFormat("json")}
          className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
            format === "json" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          .2p5d
        </button>
      </div>
      <div className="relative">
        <div className="absolute right-2 top-2 z-10 rounded-md bg-black/40 px-1.5 py-0.5 text-[10px] text-muted-foreground backdrop-blur">
          {presetName} · {format === "html" ? "self-contained" : format === "react" ? "framer-motion" : "Disguise container"}
        </div>
        <pre className="scroll-thin max-h-72 overflow-auto rounded-lg border border-white/5 bg-black/40 p-3 text-[11px] leading-relaxed">
          <code className="font-mono text-foreground/90">{code}</code>
        </pre>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {format === "json"
          ? "Contenedor .2p5d (Disguise r26.3+). Importa en objects/2p5DFile y asigna a MR set backplate."
          : "Reemplaza las URLs de las imágenes con tus assets en producción."}
        {format === "react" &&
          " Requiere framer-motion instalado."}
      </p>
    </section>
  );
}
