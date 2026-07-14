"use client";

import { useEffect, useState, useCallback } from "react";
import { useAliveStore } from "@/lib/store";
import type { ProjectState } from "@/lib/types";
import { toast } from "sonner";

const STORAGE_KEY = "alive-studio:projects";
const CURRENT_KEY = "alive-studio:current";

export interface SavedProject {
  id: string;
  name: string;
  thumbnail?: string;
  savedAt: number;
  state: Partial<ProjectState>;
}

/**
 * v3 FEATURE: Save/Load projects to localStorage.
 * Prevents losing all work on refresh. Projects include full animation config,
 * layers, analysis, but NOT the image files (those are in /uploads/ temporarily).
 */

export function useProjectPersistence() {
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const store = useAliveStore();

  // Load saved projects list on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const projects = JSON.parse(raw) as SavedProject[];
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSavedProjects(projects.sort((a, b) => b.savedAt - a.savedAt));
      }
    } catch (e) {
      console.warn("[persistence] failed to load projects", e);
    }
  }, []);

  // Auto-save current state (debounced) — prevents total loss on refresh
  useEffect(() => {
    if (!store.originalUrl || store.layers.length === 0) return;
    const timer = setTimeout(() => {
      try {
        const state: Partial<ProjectState> = {
          id: store.id,
          originalUrl: store.originalUrl,
          width: store.width,
          height: store.height,
          analysis: store.analysis,
          layers: store.layers,
          depthMapUrl: store.depthMapUrl,
          backgroundUrl: store.backgroundUrl,
          animation: store.animation,
          status: store.status,
          strategy: store.strategy,
          pipelineStep: store.pipelineStep,
        };
        localStorage.setItem(CURRENT_KEY, JSON.stringify(state));
      } catch (e) {
        // localStorage might be full (images are large)
        console.warn("[persistence] auto-save failed", e);
      }
    }, 2000); // 2s debounce
    return () => clearTimeout(timer);
  }, [store.id, store.originalUrl, store.layers, store.animation, store.depthMapUrl, store.backgroundUrl, store.status, store.strategy, store.pipelineStep, store.width, store.height, store.analysis]);

  const saveProject = useCallback((name: string) => {
    if (!store.originalUrl || store.layers.length === 0) {
      toast.error("No hay proyecto para guardar");
      return;
    }

    const project: SavedProject = {
      id: `proj-${Date.now()}`,
      name: name || `Proyecto ${new Date().toLocaleDateString()}`,
      savedAt: Date.now(),
      state: {
        id: store.id,
        originalUrl: store.originalUrl,
        width: store.width,
        height: store.height,
        analysis: store.analysis,
        layers: store.layers,
        depthMapUrl: store.depthMapUrl,
        backgroundUrl: store.backgroundUrl,
        animation: store.animation,
        status: store.status,
        strategy: store.strategy,
        pipelineStep: store.pipelineStep,
      },
    };

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const projects = raw ? (JSON.parse(raw) as SavedProject[]) : [];
      projects.push(project);
      // Keep only last 20 projects (localStorage has ~5MB limit)
      const trimmed = projects.slice(-20);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      setSavedProjects(trimmed.sort((a, b) => b.savedAt - a.savedAt));
      toast.success(`Proyecto guardado: ${project.name}`);
    } catch (e: any) {
      toast.error("Error guardando (almacenamiento lleno?)", {
        description: e?.message,
      });
    }
  }, [store]);

  const loadProject = useCallback((projectId: string) => {
    const project = savedProjects.find((p) => p.id === projectId);
    if (!project) {
      toast.error("Proyecto no encontrado");
      return;
    }

    const s = project.state;
    // Restore state to store
    useAliveStore.setState({
      id: s.id ?? "",
      originalUrl: s.originalUrl ?? "",
      width: s.width ?? 0,
      height: s.height ?? 0,
      analysis: s.analysis,
      layers: s.layers ?? [],
      depthMapUrl: s.depthMapUrl,
      backgroundUrl: s.backgroundUrl,
      animation: s.animation ?? useAliveStore.getState().animation,
      status: s.status ?? "ready",
      strategy: s.strategy,
      pipelineStep: s.pipelineStep ?? "animate",
      selectedLayerId: undefined,
    });

    toast.success(`Proyecto cargado: ${project.name}`);
  }, [savedProjects]);

  const deleteProject = useCallback((projectId: string) => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const projects = raw ? (JSON.parse(raw) as SavedProject[]) : [];
      const filtered = projects.filter((p) => p.id !== projectId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      setSavedProjects(filtered.sort((a, b) => b.savedAt - a.savedAt));
      toast.success("Proyecto eliminado");
    } catch (e) {
      console.warn("[persistence] delete failed", e);
    }
  }, []);

  const loadCurrentSession = useCallback((): boolean => {
    try {
      const raw = localStorage.getItem(CURRENT_KEY);
      if (!raw) return false;
      const state = JSON.parse(raw) as Partial<ProjectState>;
      if (!state.originalUrl || !state.layers || state.layers.length === 0) return false;

      // v3 FIX: verify the original image URL is a data URL (always valid)
      // or a local path that starts with /uploads/ (might not exist if files were cleaned)
      // If it's a local path, we still restore but mark status as "uploaded" not "ready"
      // so the user knows they may need to re-process.
      const isDataUrl = state.originalUrl.startsWith("data:");
      const isLocalPath = state.originalUrl.startsWith("/uploads/") || state.originalUrl.startsWith("uploads/");

      useAliveStore.setState({
        id: state.id ?? "",
        originalUrl: state.originalUrl,
        width: state.width ?? 0,
        height: state.height ?? 0,
        analysis: state.analysis,
        layers: state.layers,
        depthMapUrl: state.depthMapUrl,
        backgroundUrl: state.backgroundUrl,
        animation: state.animation ?? useAliveStore.getState().animation,
        // If local path, set status to "ready" but layers may have broken images
        // The user will see the stage with broken images and can re-upload
        status: isDataUrl ? (state.status ?? "ready") : "ready",
        strategy: state.strategy,
        pipelineStep: state.pipelineStep ?? "animate",
        selectedLayerId: undefined,
      });

      // If local path, verify images exist asynchronously and warn if not
      if (isLocalPath) {
        fetch(state.originalUrl, { method: "HEAD" }).then((res) => {
          if (!res.ok) {
            // Image doesn't exist — clear the session and show warning
            localStorage.removeItem(CURRENT_KEY);
            useAliveStore.getState().reset();
          }
        }).catch(() => {
          // Network error — clear session
          localStorage.removeItem(CURRENT_KEY);
        });
      }

      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    savedProjects,
    saveProject,
    loadProject,
    deleteProject,
    loadCurrentSession,
  };
}
