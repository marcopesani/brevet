import { NextResponse } from "next/server";
import { generateNonce, setNonceCookie } from "@/lib/auth";

export async function GET() {
  const nonce = generateNonce();
  await setNonceCookie(nonce);
  return NextResponse.json({ nonce });
}
