import { NextRequest, NextResponse } from "next/server";
import { analyzeImage } from "@/lib/ai";
import { readImageAsDataUrl } from "@/lib/image-utils";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url required" }, { status: 400 });
    }

    let dataUrl: string;
    if (url.startsWith("data:")) {
      dataUrl = url;
    } else if (url.startsWith("http")) {
      return NextResponse.json(
        { error: "Only local uploads supported" },
        { status: 400 }
      );
    } else {
      const safeUrl = path.normalize(url).replace(/^(\.\.(\/|\\|$))+/, "");
      dataUrl = await readImageAsDataUrl(safeUrl);
    }

    const analysis = await analyzeImage(dataUrl);
    return NextResponse.json({ success: true, analysis });
  } catch (err: any) {
    console.error("[analyze] error", err);
    return NextResponse.json(
      { error: err?.message ?? "Analysis failed" },
      { status: 500 }
    );
  }
}
