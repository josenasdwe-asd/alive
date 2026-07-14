import { NextRequest, NextResponse } from "next/server";
import { extractElement } from "@/lib/ai";
import { readImageAsDataUrl, saveGeneratedImage, sanitizeFilename } from "@/lib/image-utils";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { url, element } = await req.json();
    if (!url || !element || typeof url !== "string" || typeof element !== "string") {
      return NextResponse.json(
        { error: "url and element required (strings)" },
        { status: 400 }
      );
    }
    if (element.length > 500) {
      return NextResponse.json(
        { error: "element description too long" },
        { status: 400 }
      );
    }

    const dataUrl = await readImageAsDataUrl(url);

    const buf = await extractElement(dataUrl, element);
    const safeLabel = sanitizeFilename(`custom-${element}`);
    const r = await saveGeneratedImage(buf, safeLabel);

    return NextResponse.json({ success: true, url: r.url, filename: r.filename });
  } catch (err: any) {
    console.error("[extract-element] error", err);
    return NextResponse.json(
      { error: err?.message ?? "Extraction failed" },
      { status: 500 }
    );
  }
}
