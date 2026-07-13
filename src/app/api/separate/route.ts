import { NextRequest, NextResponse } from "next/server";
import {
  generateBackgroundPlate,
  generateDepthMap,
  generateForegroundLayer,
} from "@/lib/ai";
import { readImageAsDataUrl, saveGeneratedImage } from "@/lib/image-utils";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const {
      url,
      subject,
      foreground,
    }: { url: string; subject: string; foreground?: string } = await req.json();

    if (!url || !subject) {
      return NextResponse.json(
        { error: "url and subject required" },
        { status: 400 }
      );
    }

    const safeUrl = path.normalize(url).replace(/^(\.\.(\/|\\|$))+/, "");
    const dataUrl = await readImageAsDataUrl(safeUrl);

    // Run background plate + depth map in parallel (the two essential assets)
    const tasks: Promise<unknown>[] = [
      generateBackgroundPlate(dataUrl, subject)
        .then((buf) => saveGeneratedImage(buf, "bg"))
        .then((r) => ({ key: "background", ...r })),
      generateDepthMap(dataUrl, subject)
        .then((buf) => saveGeneratedImage(buf, "depth"))
        .then((r) => ({ key: "depth", ...r })),
    ];

    if (foreground) {
      tasks.push(
        generateForegroundLayer(dataUrl, foreground)
          .then((buf) => saveGeneratedImage(buf, "fg"))
          .then((r) => ({ key: "foreground", ...r }))
          .catch((e) => {
            console.warn("[separate] foreground failed", e);
            return null;
          })
      );
    }

    const results = (await Promise.allSettled(tasks)) as any[];
    const out: Record<string, { url: string; filename: string } | null> = {};
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        out[r.value.key] = { url: r.value.url, filename: r.value.filename };
      }
    }

    if (!out.background && !out.depth) {
      return NextResponse.json(
        {
          error: "Layer generation failed for all assets",
          details: results.map((r) =>
            r.status === "rejected" ? String(r.reason) : "ok"
          ),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, ...out });
  } catch (err: any) {
    console.error("[separate] error", err);
    return NextResponse.json(
      { error: err?.message ?? "Separation failed" },
      { status: 500 }
    );
  }
}
