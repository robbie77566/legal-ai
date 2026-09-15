"use client";

import { SessionProvider } from "next-auth/react";
import VisitTracker from "@/components/VisitTracker";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <VisitTracker />
    </SessionProvider>
  );
}
