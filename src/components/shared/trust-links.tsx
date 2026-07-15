import Link from "next/link";

export function TrustLinks({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Trust, legal, and support" className={className}>
      <Link href="/privacy">Privacy</Link>
      <Link href="/terms">Terms</Link>
      <Link href="/accuracy">Accuracy</Link>
      <Link href="/support">Support</Link>
    </nav>
  );
}
