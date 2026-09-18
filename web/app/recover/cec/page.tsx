import EmailLinkForm from "@/components/cec/EmailLinkForm";
export const metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default function Page() { return <EmailLinkForm purpose="reset"/>; }
