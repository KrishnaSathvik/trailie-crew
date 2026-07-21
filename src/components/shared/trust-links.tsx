import Link from "next/link";

import { legalUrls } from "@/server/site-configuration";

export function TrustLinks({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Trust, legal, and support" className={className}>
      <Link href={legalUrls.privacy}>Privacy</Link>
      <Link href={legalUrls.terms}>Terms</Link>
      <Link href={legalUrls.accuracy}>Accuracy</Link>
      <Link href={legalUrls.support}>Support</Link>
    </nav>
  );
}
