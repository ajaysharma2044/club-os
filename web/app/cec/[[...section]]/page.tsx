import { redirect } from "next/navigation";
import { cecRoutes } from "@/lib/cec/routes";
export default async function Page({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const { section } = await params;
  redirect(cecRoutes[section?.[0] || "home"] || cecRoutes.home);
}
