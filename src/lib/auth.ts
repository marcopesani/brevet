import { createClient } from "@/lib/supabase/server";

export async function getAuthenticatedUser(): Promise<{ userId: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    return null;
  }

  return { userId: data.claims.sub as string };
}
