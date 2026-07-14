"use client";

import { useState } from "react";
import { useProjectPersistence } from "@/hooks/use-project-persistence";
import { useAliveStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Save, FolderOpen, Trash2, Download, Upload, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * v3 FEATURE: Project save/load panel.
 * Save current work, load previous projects, auto-restore on refresh.
 */
export function ProjectPanel() {
  const { savedProjects, saveProject, loadProject, deleteProject } = useProjectPersistence();
  const originalUrl = useAliveStore((s) => s.originalUrl);
  const layers = useAliveStore((s) => s.layers);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [projectName, setProjectName] = useState("");

  const handleSave = () => {
    if (!projectName.trim()) {
      toast.error("Escribe un nombre para el proyecto");
      return;
    }
    saveProject(projectName.trim());
    setProjectName("");
    setShowSaveDialog(false);
  };

  const handleExport = () => {
    // Export current state as JSON file
    const state = useAliveStore.getState();
    const exportData = {
      id: state.id,
      originalUrl: state.originalUrl,
      width: state.width,
      height: state.height,
      analysis: state.analysis,
      layers: state.layers,
      depthMapUrl: state.depthMapUrl,
      backgroundUrl: state.backgroundUrl,
      animation: state.animation,
      status: state.status,
      strategy: state.strategy,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `alive-project-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Proyecto exportado como JSON");
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        useAliveStore.setState({
          id: data.id ?? "",
          originalUrl: data.originalUrl ?? "",
          width: data.width ?? 0,
          height: data.height ?? 0,
          analysis: data.analysis,
          layers: data.layers ?? [],
          depthMapUrl: data.depthMapUrl,
          backgroundUrl: data.backgroundUrl,
          animation: data.animation ?? useAliveStore.getState().animation,
          status: data.status ?? "ready",
          strategy: data.strategy,
          pipelineStep: "animate",
          selectedLayerId: undefined,
        });
        toast.success("Proyecto importado");
      } catch {
        toast.error("Archivo inválido");
      }
    };
    reader.readAsText(file);
    e.target.value = ""; // reset for re-import
  };

  if (!originalUrl || layers.length === 0) return null;

  return (
    <section className="glass rounded-xl p-3">
      <header className="mb-2.5 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Save className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-sm font-medium tracking-tight">Proyectos</h3>
      </header>

      {/* Action buttons */}
      <div className="mb-2.5 grid grid-cols-2 gap-1.5">
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs"
          onClick={() => setShowSaveDialog(!showSaveDialog)}
        >
          <Save className="h-3 w-3" />
          Guardar
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs"
          onClick={handleExport}
        >
          <Download className="h-3 w-3" />
          Exportar
        </Button>
      </div>

      {/* Save dialog */}
      {showSaveDialog && (
        <div className="mb-2.5 space-y-1.5 rounded-lg border border-white/5 bg-white/[0.02] p-2">
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Nombre del proyecto…"
            className="h-7 w-full rounded-md border border-white/5 bg-white/[0.02] px-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
          <div className="flex gap-1.5">
            <Button size="sm" className="flex-1 text-xs" onClick={handleSave}>
              Guardar
            </Button>
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => setShowSaveDialog(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Import button */}
      <label className="mb-2.5 flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/10 px-3 py-1.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground">
        <Upload className="h-3 w-3" />
        Importar JSON
        <input type="file" accept=".json" onChange={handleImport} className="hidden" />
      </label>

      {/* Saved projects list */}
      {savedProjects.length > 0 && (
        <div className="space-y-1">
          <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            <Clock className="h-2.5 w-2.5" />
            Recientes ({savedProjects.length})
          </p>
          <div className="max-h-48 space-y-1 overflow-y-auto scroll-thin">
            {savedProjects.map((p) => (
              <div
                key={p.id}
                className="group flex items-center gap-2 rounded-md border border-white/5 bg-white/[0.02] px-2 py-1.5 transition-colors hover:border-white/15"
              >
                <button
                  onClick={() => loadProject(p.id)}
                  className="flex flex-1 items-center gap-2 text-left"
                >
                  <FolderOpen className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium">{p.name}</p>
                    <p className="text-[9px] text-muted-foreground">
                      {new Date(p.savedAt).toLocaleString()} · {p.state.layers?.length ?? 0} capas
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => deleteProject(p.id)}
                  className="flex-shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  aria-label="Eliminar"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {savedProjects.length === 0 && (
        <p className="py-2 text-center text-[10px] text-muted-foreground">
          Sin proyectos guardados aún
        </p>
      )}
    </section>
  );
}
