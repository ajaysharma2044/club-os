import { Suspense } from "react";
import { JoinFlow } from "@/components/JoinFlow";

export const metadata = {
  title: "Show up · Club OS",
  description: "Join a club in two minutes.",
};

export default function JoinPage() {
  return (
    <Suspense fallback={<p className="text-caption">Loading…</p>}>
      <JoinFlow />
    </Suspense>
  );
}
