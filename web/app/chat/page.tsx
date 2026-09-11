import { Suspense } from "react";
import { ChatApp } from "@/components/ChatApp";

export default function ChatPage() {
  return (
    <Suspense fallback={<p className="text-caption">Loading inbox…</p>}>
      <ChatApp />
    </Suspense>
  );
}
