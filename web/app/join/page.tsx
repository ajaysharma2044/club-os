import { Suspense } from "react";
import { JoinFlow } from "@/components/JoinFlow";
import { CECWorkspace } from "@/components/cec/Workspace";
export const metadata = { title: "Join CEC · Club OS" };
export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ club?: string }>;
}) {
  const { club } = await searchParams;
  if (!club || club === "cec")
    return <CECWorkspace embedded section="people" />;
  return (
    <>
      <p className="demo-notice">
        Example onboarding · information entered here stays in this browser and
        does not create a CEC account.
      </p>
      <Suspense fallback={<p>Loading…</p>}>
        <JoinFlow />
      </Suspense>
    </>
  );
}
