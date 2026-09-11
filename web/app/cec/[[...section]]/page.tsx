import { CECWorkspace } from "@/components/cec/Workspace";
export const metadata = {
  title: "CEC · Club OS",
  description:
    "Cornell Entrepreneurship Club workspace: events, work, people and the club record.",
};
export default async function Page({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const { section } = await params;
  return <CECWorkspace section={section?.[0] || "home"} />;
}
