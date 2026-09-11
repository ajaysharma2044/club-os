import { notFound } from "next/navigation";
import { EventsView } from "@/components/EventsView";
import { clubBySlug } from "@/lib/data";

export default async function EventsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!clubBySlug(slug)) notFound();
  return <EventsView slug={slug} />;
}
