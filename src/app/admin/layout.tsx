import type { ReactNode } from "react";

/** Root admin segment — login stays unguarded; protected routes use (protected)/layout. */
export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return children;
}
