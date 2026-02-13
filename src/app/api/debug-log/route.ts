import { NextRequest, NextResponse } from "next/server";
import { debugLogServer } from "@/lib/debug-log-server";

/** Debug only: client POSTs here to write a line to debug.log (proves client code ran). */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = typeof body === "object" && body !== null ? body : { message: "debug", data: body };
    debugLogServer({
      location: (payload.location as string) ?? "api/debug-log",
      message: (payload.message as string) ?? "client log",
      data: (payload.data as Record<string, unknown>) ?? {},
      hypothesisId: (payload.hypothesisId as string) ?? "H0",
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
