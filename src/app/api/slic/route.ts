import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { sliceWithSlic } from "@/lib/slic";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const {
      originalUrl,
      depthUrl,
      k,
      compactness,
      depthWeight,
    }: {
      originalUrl: string;
      depthUrl: string;
      k?: number;
      compactness?: number;
      depthWeight?: number;
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

    const layers = await sliceWithSlic(originalPath, depthPath, {
      k,
      compactness,
      depthWeight,
    });

    return NextResponse.json({ success: true, layers });
  } catch (err: any) {
    console.error("[slic] error", err);
    return NextResponse.json(
      { error: err?.message ?? "SLIC failed" },
      { status: 500 }
    );
  }
}
