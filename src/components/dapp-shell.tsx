import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import Link from "next/link";

export function DappShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-7xl flex flex-1 flex-col gap-4 mt-8">
      <div className="flex flex-1 flex-row justify-between items-center">
        <div>Brevet</div>
        <div>0x30284103928241...2134</div>
      </div>
      <div className="flex flex-1 flex-row gap-4">
        <div className="w-64">
          <ul>
            <li>
              <Link href="/v2">Dashboard</Link>
            </li>
            <li>
              <Link href="/v2/setup">Setup</Link>
            </li>
          </ul>
        </div>
        <div className="flex flex-1 flex-col gap-4">{children}</div>
        <Toaster />
      </div>
      <div>Footer</div>
    </div>
  );
}
