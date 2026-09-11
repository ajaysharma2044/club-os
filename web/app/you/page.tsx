import Link from "next/link";
import { CECWorkspace } from "@/components/cec/Workspace";
const tabs = [
  ["account", "Account"],
  ["intake", "Weekly update"],
  ["record", "Your record"],
  ["schedule", "Calendar"],
];
export default async function YouPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const selected = tabs.some(([v]) => v === view) ? view! : "account";
  return (
    <>
      <nav
        className="connected-links personal-tabs"
        aria-label="Your workspace"
      >
        {tabs.map(([v, label]) => (
          <Link
            key={v}
            href={"/you?view=" + v}
            aria-current={selected === v ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <CECWorkspace
        key={selected}
        embedded
        section={selected}
        personal={selected === "record"}
      />
    </>
  );
}
