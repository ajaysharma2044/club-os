import { notFound } from "next/navigation";
import { MoneyView } from "@/components/MoneyView";
import { clubBySlug } from "@/lib/data";

export default async function MoneyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const club = clubBySlug(slug);
  if (!club) notFound();
  return <MoneyView club={club} />;
}
