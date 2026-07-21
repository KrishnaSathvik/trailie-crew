import Link from "next/link";

import { legalUrls } from "@/server/site-configuration";

/**
 * Used on surfaces that can be read outside the app (public shares, exports),
 * so these stay absolute and canonical. In-app marketing navigation uses the
 * relative `legalPaths` instead.
 */
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
