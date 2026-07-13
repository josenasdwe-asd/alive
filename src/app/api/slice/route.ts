import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { sliceImageByDepth } from "@/lib/depth-slice";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/slice
 * Body: { originalUrl, depthUrl, k?, dilationRadius?, featherSigma? }
 *
 * Mathematically slices the image into N depth-based layers using K-means 1D
 * clustering on the depth map + morphological dilation + alpha feathering.
 * Fast (~2-3s), deterministic, no AI per-layer calls.
 */
export async function POST(req: NextRequest) {
  try {
    const {
      originalUrl,
      depthUrl,
      k,
      dilationRadius,
      featherSigma,
    }: {
      originalUrl: string;
      depthUrl: string;
      k?: number;
      dilationRadius?: number;
      featherSigma?: number;
    } = await req.json();

    if (!originalUrl || !depthUrl) {
      return NextResponse.json(
        { error: "originalUrl and depthUrl required" },
        { status: 400 }
      );
    }

    const safeOriginal = path
      .normalize(originalUrl)
      .replace(/^(\.\.(\/|\\|$))+/, "");
    const safeDepth = path
      .normalize(depthUrl)
      .replace(/^(\.\.(\/|\\|$))+/, "");

    const originalPath = path.join(process.cwd(), "public", safeOriginal);
    const depthPath = path.join(process.cwd(), "public", safeDepth);

    const layers = await sliceImageByDepth(originalPath, depthPath, {
      k,
      dilationRadius,
      featherSigma,
    });

    return NextResponse.json({ success: true, layers });
  } catch (err: any) {
    console.error("[slice] error", err);
    return NextResponse.json(
      { error: err?.message ?? "Slice failed" },
      { status: 500 }
    );
  }
}
