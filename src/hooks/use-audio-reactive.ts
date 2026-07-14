"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface AudioFrequencyData {
  /** Low frequencies (bass) 0..1 */
  bass: number;
  /** Mid frequencies 0..1 */
  mid: number;
  /** High frequencies (treble) 0..1 */
  treble: number;
  /** Overall volume 0..1 */
  volume: number;
  /** Beat detection: true on beat frame */
  beat: boolean;
  /** Beat intensity 0..1 (decays after beat) */
  beatIntensity: number;
}

/**
 * v3 RADICAL: Audio-reactive motion.
 *
 * Analyzes audio (microphone or uploaded file) via Web Audio API's AnalyserNode.
 * Extracts bass/mid/treble bands + beat detection.
 *
 * The motion engine can use this data to make layers pulse with the beat,
 * glow with the volume, and drift with the treble.
 *
 * Beat detection algorithm:
 * - Track rolling average of bass energy
 * - If current bass > avg × 1.3 AND > threshold → beat
 * - Beat intensity decays exponentially (0.85/frame)
 */
export function useAudioReactive() {
  const [audioData, setAudioData] = useState<AudioFrequencyData>({
    bass: 0, mid: 0, treble: 0, volume: 0, beat: false, beatIntensity: 0,
  });
  const [isListening, setIsListening] = useState(false);
  const [audioSource, setAudioSource] = useState<"mic" | "file" | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | AudioBufferSourceNode | null>(null);
  const rafRef = useRef<number>(0);
  const bassHistoryRef = useRef<number[]>([]);
  const beatIntensityRef = useRef(0);
  const lastBeatTimeRef = useRef(0);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (sourceRef.current) {
      try {
        (sourceRef.current as any).stop?.();
        sourceRef.current.disconnect();
      } catch {}
      sourceRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
    setIsListening(false);
    setAudioSource(null);
    setAudioData({ bass: 0, mid: 0, treble: 0, volume: 0, beat: false, beatIntensity: 0 });
  }, []);

  const startLoop = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const tick = () => {
      analyser.getByteFrequencyData(dataArray);

      // Split into bass (0-250Hz), mid (250-4kHz), treble (4k-20kHz)
      const bassEnd = Math.floor(250 / (44100 / 2) * bufferLength);
      const midEnd = Math.floor(4000 / (44100 / 2) * bufferLength);
      const trebleEnd = Math.floor(10000 / (44100 / 2) * bufferLength);

      let bassSum = 0, midSum = 0, trebleSum = 0;
      for (let i = 0; i < bassEnd; i++) bassSum += dataArray[i];
      for (let i = bassEnd; i < midEnd; i++) midSum += dataArray[i];
      for (let i = midEnd; i < trebleEnd; i++) trebleSum += dataArray[i];

      const bass = bassSum / Math.max(1, bassEnd) / 255;
      const mid = midSum / Math.max(1, midEnd - bassEnd) / 255;
      const treble = trebleSum / Math.max(1, trebleEnd - midEnd) / 255;
      const volume = (bass + mid + treble) / 3;

      // Beat detection
      bassHistoryRef.current.push(bass);
      if (bassHistoryRef.current.length > 43) bassHistoryRef.current.shift();
      const avgBass = bassHistoryRef.current.reduce((a, b) => a + b, 0) / bassHistoryRef.current.length;

      const now = performance.now();
      const timeSinceLastBeat = now - lastBeatTimeRef.current;
      let beat = false;

      if (bass > avgBass * 1.3 && bass > 0.3 && timeSinceLastBeat > 200) {
        beat = true;
        lastBeatTimeRef.current = now;
        beatIntensityRef.current = bass;
      }

      beatIntensityRef.current *= 0.92;
      if (beatIntensityRef.current < 0.01) beatIntensityRef.current = 0;

      
      setAudioData({ bass, mid, treble, volume, beat, beatIntensity: beatIntensityRef.current });

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const startMic = useCallback(async () => {
    try {
      stop();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.8;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      sourceRef.current = source;
      setIsListening(true);
      setAudioSource("mic");
      startLoop();
    } catch (e: any) {
      console.error("[audio] mic failed", e);
      throw e;
    }
  }, [stop, startLoop]);

  const startFile = useCallback(async (file: File) => {
    try {
      stop();
      const arrayBuffer = await file.arrayBuffer();
      const ctx = new AudioContext();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.8;

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.loop = true;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      source.start();

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      sourceRef.current = source;
      setIsListening(true);
      setAudioSource("file");
      startLoop();
    } catch (e: any) {
      console.error("[audio] file failed", e);
      throw e;
    }
  }, [stop, startLoop]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return {
    audioData,
    isListening,
    audioSource,
    startMic,
    startFile,
    stop,
  };
}
