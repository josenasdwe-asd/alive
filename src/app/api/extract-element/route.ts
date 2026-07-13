import { NextRequest, NextResponse } from "next/server";
import { extractElement } from "@/lib/ai";
import { readImageAsDataUrl, saveGeneratedImage } from "@/lib/image-utils";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { url, element } = await req.json();
    if (!url || !element) {
      return NextResponse.json(
        { error: "url and element required" },
        { status: 400 }
      );
    }

    const safeUrl = path.normalize(url).replace(/^(\.\.(\/|\\|$))+/, "");
    const dataUrl = await readImageAsDataUrl(safeUrl);

    const buf = await extractElement(dataUrl, element);
    const r = await saveGeneratedImage(
      buf,
      `custom-${element.toLowerCase().replace(/\s+/g, "-").slice(0, 20)}`
    );

    return NextResponse.json({ success: true, url: r.url, filename: r.filename });
  } catch (err: any) {
    console.error("[extract-element] error", err);
    return NextResponse.json(
      { error: err?.message ?? "Extraction failed" },
      { status: 500 }
    );
  }
}
