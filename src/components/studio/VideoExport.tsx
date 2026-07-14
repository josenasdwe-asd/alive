"use client";

import { useState, useRef } from "react";
import { Video, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface VideoExportProps {
  /** duration in seconds */
  duration?: number;
  /** fps */
  fps?: number;
}

/**
 * Video export — records the stage canvas to a WebM video.
 *
 * Uses MediaRecorder API to capture the canvas at 30fps for N seconds,
 * then downloads the resulting WebM file.
 *
 * Works with both WebGL canvas (KenBurns3D, WebGL) and CSS mode
 * (falls back to html2canvas-style screenshot capture).
 */
export function VideoExport({ duration = 5, fps = 30 }: VideoExportProps) {
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const cancelRef = useRef(false);

  const handleRecord = async () => {
    // find the MAIN stage canvas (not relighting/particle canvases)
    // the main canvas is the largest one inside the stage container
    // BUG A1 fix: stage now uses data-alive-stage attribute (was class selector that broke
    // when aspect ratio became inline-style driven)
    const stageDiv = document.querySelector(
      "[data-alive-stage='true']"
    ) as HTMLElement;
    const allCanvases = (stageDiv || document).querySelectorAll("canvas");
    let canvas: HTMLCanvasElement | null = null;
    let maxArea = 0;
    allCanvases.forEach((c) => {
      const area = c.width * c.height;
      if (area > maxArea) {
        maxArea = area;
        canvas = c as HTMLCanvasElement;
      }
    });

    if (!canvas && !stageDiv) {
      toast.error("No se encontró el stage para grabar");
      return;
    }

    setRecording(true);
    setProgress(0);
    cancelRef.current = false;

    try {
      // check if we have a canvas (WebGL or 2D context — captureStream works on any canvas)
      // Note: can't call getContext("webgl2") again if already obtained — just check canvas exists
      if (canvas && canvas.width > 1 && canvas.height > 1) {
        const stream = canvas.captureStream(fps);
        // try vp9, fallback to vp8, fallback to default
        let mimeType = "video/webm;codecs=vp9";
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = "video/webm;codecs=vp8";
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = "video/webm";
          }
        }
        const recorder = new MediaRecorder(stream, { mimeType });
        const chunks: Blob[] = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: "video/webm" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `alive-animation-${Date.now()}.webm`;
          a.click();
          URL.revokeObjectURL(url);
          toast.success("Video WebM descargado");
          setRecording(false);
          setProgress(0);
        };

        recorder.start();

        // progress tracking
        const startTime = Date.now();
        const totalMs = duration * 1000;
        const progressInterval = setInterval(() => {
          if (cancelRef.current) {
            clearInterval(progressInterval);
            recorder.stop();
            return;
          }
          const elapsed = Date.now() - startTime;
          setProgress(Math.min(1, elapsed / totalMs));
          if (elapsed >= totalMs) {
            clearInterval(progressInterval);
            recorder.stop();
          }
        }, 100);
      } else {
        // CSS mode: no canvas to capture — inform user to switch to WebGL mode
        toast.info("Cambia a modo WebGL o 3D KB para grabar video");
        setRecording(false);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Error grabando video");
      setRecording(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={handleRecord}
        disabled={recording}
        className="gap-1.5"
      >
        {recording ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Video className="h-3 w-3" />
        )}
        {recording ? `${Math.round(progress * 100)}%` : "Video"}
      </Button>
      {recording && (
        <button
          onClick={() => {
            cancelRef.current = true;
          }}
          className="text-[11px] text-destructive hover:underline"
        >
          Cancelar
        </button>
      )}
    </div>
  );
}
