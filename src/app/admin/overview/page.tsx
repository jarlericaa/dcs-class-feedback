import { redirect } from "next/navigation";

/** Accounts is the operational landing page for Platform Admin. */
export default function PlatformAdminOverview() {
  redirect("/admin");
}
