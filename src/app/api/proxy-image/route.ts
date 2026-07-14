import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/proxy-image?url=<external-url>
 *
 * Downloads an external image server-side and returns it to the client.
 * Avoids CORS/NetworkError when fetching external URLs (Unsplash, etc.)
 * from the browser.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "url parameter required" }, { status: 400 });
  }

  // Only allow http/https URLs
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "AliveStudio/1.0" },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch image: ${res.status}` },
        { status: 502 }
      );
    }

    const contentType = res.headers.get("content-type") || "image/jpeg";
    const buffer = await res.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err: any) {
    console.error("[proxy-image] error", err);
    return NextResponse.json(
      { error: "Failed to download image" },
      { status: 502 }
    );
  }
}
