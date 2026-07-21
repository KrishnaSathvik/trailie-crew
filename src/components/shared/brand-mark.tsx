import Image from "next/image";

/**
 * The Trailie Crew mark.
 *
 * Sourced from the 512px app icon rather than `logo.png`: the same artwork at
 * a fifth of the weight, and the only variant with an alpha channel.
 *
 * The art is an app-icon tile — a rounded cream plate inside a wider margin —
 * so it is scaled up inside a clipping container to trim that margin and let
 * the route mark fill the box at nav size.
 */
export function BrandMark({ className = "size-6" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-block shrink-0 overflow-hidden rounded-[6px] ${className}`}
    >
      <Image
        src="/android-chrome-512x512.png"
        alt=""
        width={96}
        height={96}
        priority
        className="absolute inset-0 size-full scale-[1.42] object-cover"
      />
    </span>
  );
}
