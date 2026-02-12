import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { createHotWallet } from "@/lib/hot-wallet";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 },
      );
    }

    if (typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json(
        { error: "Email and password must be strings" },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status ?? 400 },
      );
    }

    if (!data.user) {
      return NextResponse.json(
        { error: "Signup failed: no user returned" },
        { status: 500 },
      );
    }

    const userId = data.user.id;

    // Create user record, hot wallet, and default spending policy
    const { address, encryptedPrivateKey } = createHotWallet();

    await prisma.user.create({
      data: {
        id: userId,
        email,
        walletAddress: address,
        hotWallet: {
          create: {
            address,
            encryptedPrivateKey,
          },
        },
        spendingPolicy: {
          create: {},
        },
      },
    });

    return NextResponse.json({
      user: {
        id: userId,
        email: data.user.email,
      },
      walletAddress: address,
    });
  } catch (error) {
    console.error("Signup failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
