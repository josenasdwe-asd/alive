"use client";

import { useEffect, useRef, useState } from "react";
import { Music, Mic, Upload, Square, Activity, Zap } from "lucide-react";
import { useAudioReactive } from "@/hooks/use-audio-reactive";
import { useAliveStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * v3 RADICAL: Audio-reactive animation panel.
 *
 * Lets users:
 * - Start microphone input → layers pulse with ambient sound
 * - Upload an audio file → layers pulse with the music
 * - Adjust sensitivity per frequency band (bass/mid/treble)
 * - See live frequency visualization
 *
 * The audio data feeds into the motion engine via the store's audioData field.
 */
export function AudioReactivePanel() {
  const {
    audioData,
    isListening,
    audioSource,
    startMic,
    startFile,
    stop,
  } = useAudioReactive();

  const updateAnimation = useAliveStore((s) => s.updateAnimation);
  const animation = useAliveStore((s) => s.animation);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sensitivity, setSensitivity] = useState(1);

  // Feed audio data into the store for the motion engine to read
  // (done via a ref on the store, not state, to avoid re-renders)
  useEffect(() => {
    if (isListening && audioData) {
      (window as any).__aliveAudio = { ...audioData, sensitivity };
    } else {
      (window as any).__aliveAudio = null;
    }
  }, [isListening, audioData, sensitivity]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await startFile(file);
    } catch {
      // error handled in hook
    }
    e.target.value = "";
  };

  return (
    <section className="glass rounded-xl p-3">
      <header className="mb-2.5 flex items-center gap-2">
        <span className={cn(
          "flex h-6 w-6 items-center justify-center rounded-md",
          isListening ? "bg-primary/20 text-primary" : "bg-primary/15 text-primary"
        )}>
          <Music className="h-3.5 w-3.5" />
        </span>
        <h3 className="flex-1 text-sm font-medium tracking-tight">Audio reactivo</h3>
        {isListening && (
          <span className="flex items-center gap-1 text-[10px] text-primary">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            {audioSource === "mic" ? "Mic" : "Archivo"}
          </span>
        )}
      </header>

      {/* Source buttons */}
      <div className="mb-2.5 grid grid-cols-2 gap-1.5">
        {!isListening ? (
          <>
            <button
              onClick={startMic}
              className="flex items-center justify-center gap-1.5 rounded-md border border-white/5 bg-white/[0.02] px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
            >
              <Mic className="h-3 w-3" />
              Micrófono
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-1.5 rounded-md border border-white/5 bg-white/[0.02] px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
            >
              <Upload className="h-3 w-3" />
              Subir audio
            </button>
          </>
        ) : (
          <button
            onClick={stop}
            className="col-span-2 flex items-center justify-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive transition-colors hover:bg-destructive/20"
          >
            <Square className="h-3 w-3" />
            Detener
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          onChange={handleFile}
          className="hidden"
        />
      </div>

      {/* Live frequency visualization */}
      {isListening && (
        <div className="mb-2.5 space-y-1.5">
          <FreqBar label="Graves" value={audioData.bass} color="oklch(0.7 0.2 30)" />
          <FreqBar label="Medios" value={audioData.mid} color="oklch(0.7 0.2 150)" />
          <FreqBar label="Agudos" value={audioData.treble} color="oklch(0.7 0.2 250)" />
          <FreqBar label="Volumen" value={audioData.volume} color="oklch(0.7 0.15 0)" />
          {audioData.beatIntensity > 0.01 && (
            <div className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] text-primary">
              <Zap className="h-2.5 w-2.5" />
              Beat: {Math.round(audioData.beatIntensity * 100)}%
            </div>
          )}
        </div>
      )}

      {/* Sensitivity slider */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Activity className="h-2.5 w-2.5" />
            Sensibilidad
          </label>
          <span className="font-mono text-[10px] text-muted-foreground">
            {sensitivity.toFixed(1)}×
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={3}
          step={0.1}
          value={sensitivity}
          onChange={(e) => setSensitivity(parseFloat(e.target.value))}
          className="h-1 w-full accent-primary"
        />
      </div>

      {!isListening && (
        <p className="mt-2 rounded-md border border-white/5 bg-white/[0.02] p-2 text-[10px] leading-relaxed text-muted-foreground">
          Las capas pulsan con los graves, se mueven con los medios
          y brillan con los agudos. Los beats generan pulsos de escala.
        </p>
      )}
    </section>
  );
}

function FreqBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 text-[9px] text-muted-foreground">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full transition-all duration-75"
          style={{ width: `${Math.min(100, value * 100)}%`, background: color }}
        />
      </div>
      <span className="w-6 text-right font-mono text-[9px] text-muted-foreground">
        {Math.round(value * 100)}
      </span>
    </div>
  );
}
