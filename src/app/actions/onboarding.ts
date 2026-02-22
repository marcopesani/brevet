"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  updateOnboardingStep,
  dismissOnboarding,
  resumeOnboarding,
} from "@/lib/data/users";

export async function completeOnboardingStep(
  step: number,
  skipped?: boolean,
) {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  try {
    await updateOnboardingStep(auth.userId, step, skipped);
  } catch {
    return { error: "Failed to update onboarding state" };
  }

  // Navigation OUTSIDE try-catch (Next.js navigation APIs throw special errors)
  revalidatePath("/dashboard/setup");
  revalidatePath("/dashboard");
}

export async function dismissOnboardingAction() {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  try {
    await dismissOnboarding(auth.userId);
  } catch {
    return { error: "Failed to dismiss onboarding" };
  }

  revalidatePath("/dashboard/setup");
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function resumeOnboardingAction() {
  const auth = await getAuthenticatedUser();
  if (!auth) throw new Error("Unauthorized");

  try {
    await resumeOnboarding(auth.userId);
  } catch {
    return { error: "Failed to resume onboarding" };
  }

  revalidatePath("/dashboard");
  redirect("/dashboard/setup");
}
