import { redirect } from "next/navigation";

export default function PendingPage() {
  redirect("/dashboard/transactions");
}
