"use client";

import { useEffect, useRef, useState } from "react";

/**
 * v3 FEATURE: Mobile gyroscope parallax.
 *
 * Uses DeviceOrientationEvent to get device tilt → feeds into the same
 * parallax system as mouse movement. On iOS 13+, requires explicit permission.
 *
 * Returns:
 * - tilt: { x, y } normalized -1..1 (like mouse parallax)
 * - supported: whether device orientation is available
 * - permissionGranted: whether user has granted permission (iOS)
 * - requestPermission: function to request access (call on user gesture)
 * - enabled: whether gyroscope is currently active
 * - toggle: function to enable/disable
 */
export function useGyroscope() {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [supported, setSupported] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const smoothingRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    // Check if DeviceOrientationEvent is supported
    if (typeof window !== "undefined" && "DeviceOrientationEvent" in window) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSupported(true);
    }
  }, []);

  useEffect(() => {
    if (!enabled || !permissionGranted) return;

    const handle = (e: DeviceOrientationEvent) => {
      // beta: front-back tilt (-180 to 180, 0 = flat)
      // gamma: left-right tilt (-90 to 90, 0 = flat)
      const beta = e.beta ?? 0;
      const gamma = e.gamma ?? 0;

      // Normalize to -1..1 (clamp at ±30° for full range)
      const targetX = Math.max(-1, Math.min(1, gamma / 30));
      const targetY = Math.max(-1, Math.min(1, (beta - 45) / 30)); // 45° = comfortable holding angle

      // Smooth (lerp toward target)
      smoothingRef.current.x += (targetX - smoothingRef.current.x) * 0.1;
      smoothingRef.current.y += (targetY - smoothingRef.current.y) * 0.1;

      setTilt({ x: smoothingRef.current.x, y: smoothingRef.current.y });
    };

    window.addEventListener("deviceorientation", handle);
    return () => window.removeEventListener("deviceorientation", handle);
  }, [enabled, permissionGranted]);

  const requestPermission = async () => {
    // iOS 13+ requires explicit permission via user gesture
    const DOE = window.DeviceOrientationEvent as any;
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const result = await DOE.requestPermission();
        if (result === "granted") {
          setPermissionGranted(true);
          setEnabled(true);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    }
    // Android/other: no permission needed
    setPermissionGranted(true);
    setEnabled(true);
    return true;
  };

  const toggle = () => {
    if (!enabled && !permissionGranted) {
      requestPermission();
    } else {
      setEnabled(!enabled);
    }
  };

  return { tilt, supported, permissionGranted, enabled, requestPermission, toggle };
}
