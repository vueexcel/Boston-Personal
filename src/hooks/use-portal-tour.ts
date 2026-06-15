"use client";

import { usePortalTourContext } from "@/components/tenant-portal/portal-tour-provider";

export function usePortalTour() {
  return usePortalTourContext();
}
