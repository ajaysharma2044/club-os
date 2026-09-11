import JoinWithInvite from "@/components/cec/JoinWithInvite";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ i?: string }>;
}) {
  const { i } = await searchParams;
  return <JoinWithInvite code={i || ""} />;
}
