import { CECWorkspace } from "@/components/cec/Workspace";
import { notFound } from "next/navigation";
import { MoneyView } from "@/components/MoneyView";
import { clubBySlug } from "@/lib/data";

export default async function MoneyPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug } = await params;
  const {tab} = await searchParams;
  if (slug === "cec") return <CECWorkspace embedded section="crm" initialTab={tab && ["Contacts","Opportunities","Money"].includes(tab) ? tab : "Money"} />;
  const club = clubBySlug(slug);
  if (!club) notFound();
  return <MoneyView club={club} />;
}

