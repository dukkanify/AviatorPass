import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@/styles/classroom.css";

export const metadata: Metadata = {
  title: "Join class",
};

export default function JoinLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://source.zoom.us" crossOrigin="anonymous" />
      <link rel="dns-prefetch" href="https://source.zoom.us" />
      {children}
    </>
  );
}
