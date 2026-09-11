import { Suspense } from "react";
import { ChatApp } from "@/components/ChatApp";
import { CECWorkspace } from "@/components/cec/Workspace";
export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  if (c && !["general", "events", "builders", "cec"].includes(c))
    return (
      <>
        <p className="demo-notice">Example inbox · demonstration messages</p>
        <Suspense fallback={<p>Loading example inbox…</p>}>
          <ChatApp />
        </Suspense>
      </>
    );
  return (
    <div className="connected-inbox">
      <CECWorkspace
        embedded
        section="work"
        initialTab="Inbox"
        initialChannel={c}
      />
    </div>
  );
}
