import { CECWorkspace } from "@/components/cec/Workspace";
import { notFound } from "next/navigation";
import { MoneyView } from "@/components/MoneyView";
import { clubBySlug } from "@/lib/data";

export default async function MoneyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (slug === "cec") return <CECWorkspace embedded section="crm" initialTab="Money" />;
  const club = clubBySlug(slug);
  if (!club) notFound();
  return <MoneyView club={club} />;
}

