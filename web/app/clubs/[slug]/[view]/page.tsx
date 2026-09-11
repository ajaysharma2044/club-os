import { notFound } from "next/navigation";
import { CECWorkspace } from "@/components/cec/Workspace";
const views = ["record", "intake", "schedule", "directory", "interviews", "signals", "planning"];
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; view: string }>;
}) {
  const { slug, view } = await params;
  if (slug !== "cec" || !views.includes(view)) notFound();
  return <CECWorkspace embedded section={view} />;
}
