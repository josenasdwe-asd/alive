import { NextRequest, NextResponse } from "next/server";
import { saveUpload } from "@/lib/image-utils";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "File must be an image" },
        { status: 400 }
      );
    }

    // 12 MB limit
    if (file.size > 12 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Image too large (max 12MB)" },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    // Whitelist extensions — never trust file.name from client
    const ALLOWED_EXTS = ["jpg", "jpeg", "png", "webp", "gif"];
    const rawExt = (file.name.split(".").pop() || "").toLowerCase();
    const ext = ALLOWED_EXTS.includes(rawExt) ? rawExt : "jpg";
    const result = await saveUpload(buffer, ext);

    return NextResponse.json({
      success: true,
      id: result.id,
      url: result.url,
      width: result.width,
      height: result.height,
    });
  } catch (err: any) {
    console.error("[upload] error", err);
    return NextResponse.json(
      { error: err?.message ?? "Upload failed" },
      { status: 500 }
    );
  }
}
