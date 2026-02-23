import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import "@/styles/dapp-animations.css";

export default async function DappLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      {/* Safe area padding for mobile wallet browsers */}
      <div
        className="mx-auto max-w-md"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(1rem, env(safe-area-inset-right))",
        }}
      >
        {children}
      </div>
    </div>
  );
}
