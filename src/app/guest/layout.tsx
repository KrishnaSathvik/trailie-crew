import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
  referrer: "no-referrer",
};

export default function GuestLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
