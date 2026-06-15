"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import "@/components/tenant-portal/portal-tour.css";
import {
  PORTAL_TOUR_STEPS,
  tourSelector,
  type PortalTourStep,
} from "@/lib/tenant-portal/portal-tour-steps";
import {
  clearTourSession,
  getActiveTourStepIndex,
  isTourCompleted,
  isTourSessionActive,
  markTourCompleted,
  setActiveTourStepIndex,
  setTourSessionActive,
} from "@/lib/tenant-portal/portal-tour-storage";

type PortalTourContextValue = {
  startTour: () => void;
  skipTour: () => void;
  isTourActive: boolean;
};

const PortalTourContext = React.createContext<PortalTourContextValue | null>(
  null,
);

type PortalTourProviderProps = {
  children: React.ReactNode;
  openMobileNav: () => void;
};

async function waitForElement(
  selector: string,
  timeoutMs = 4000,
): Promise<Element | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const el = document.querySelector(selector);
    if (el) return el;
    await new Promise((resolve) => window.setTimeout(resolve, 60));
  }
  return null;
}

function isMobileViewport(): boolean {
  return window.matchMedia("(max-width: 767px)").matches;
}

function resolveSidebarNavElement(): Element | undefined {
  if (isMobileViewport()) {
    const mobile = document.querySelector(
      "[data-portal-mobile-drawer] [data-tour=\"sidebar-nav\"]",
    );
    if (mobile) return mobile;
  }
  const desktop = document.querySelector(
    "[data-portal-desktop-sidebar] [data-tour=\"sidebar-nav\"]",
  );
  return desktop ?? document.querySelector(tourSelector("sidebar-nav")) ?? undefined;
}

function stepElement(step: PortalTourStep): string | (() => Element) {
  if (step.id === "sidebar-nav") {
    return () => resolveSidebarNavElement() as Element;
  }
  return tourSelector(step.tourId);
}

function beforeStepHighlight(
  step: PortalTourStep,
  openMobileNav: () => void,
): void {
  if (step.openMobileNav && isMobileViewport()) {
    openMobileNav();
  }
}

export function PortalTourProvider({
  children,
  openMobileNav,
}: PortalTourProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const driverRef = React.useRef<Driver | null>(null);
  const navigatingRef = React.useRef(false);
  const autoStartAttemptedRef = React.useRef(false);
  const [isTourActive, setIsTourActive] = React.useState(false);

  const finishTour = React.useCallback(() => {
    driverRef.current?.destroy();
    driverRef.current = null;
    markTourCompleted();
    clearTourSession();
    setIsTourActive(false);
    navigatingRef.current = false;
  }, []);

  const navigateToStep = React.useCallback(
    (index: number) => {
      const step = PORTAL_TOUR_STEPS[index];
      if (!step) return;
      setActiveTourStepIndex(index);
      navigatingRef.current = true;
      driverRef.current?.destroy();
      driverRef.current = null;
      if (pathname !== step.pathname) {
        router.push(step.pathname);
      }
    },
    [pathname, router],
  );

  const driveAtIndex = React.useCallback(
    async (index: number) => {
      const step = PORTAL_TOUR_STEPS[index];
      if (!step) {
        finishTour();
        return;
      }

      if (pathname !== step.pathname) {
        navigateToStep(index);
        return;
      }

      beforeStepHighlight(step, openMobileNav);
      if (step.id === "sidebar-nav" && isMobileViewport()) {
        await new Promise((resolve) => window.setTimeout(resolve, 320));
      }

      const selector = tourSelector(step.tourId);
      const element = await waitForElement(selector);
      if (!element) {
        console.warn(`[portal-tour] Missing target: ${selector}`);
      }

      driverRef.current?.destroy();

      const driverObj = driver({
        showProgress: true,
        progressText: "{{current}} of {{total}}",
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Done",
        allowClose: true,
        overlayOpacity: 0.55,
        popoverClass: "bostel-driver-popover",
        steps: PORTAL_TOUR_STEPS.map((s) => ({
          element: stepElement(s),
          popover: {
            title: s.title,
            description: s.description,
            side: s.side,
            align: s.align,
          },
        })),
        onNextClick: (_element, _step, { driver: d }) => {
          if (d.isLastStep()) {
            finishTour();
            d.destroy();
            return;
          }
          const current = d.getActiveIndex() ?? 0;
          const next = current + 1;
          const nextStep = PORTAL_TOUR_STEPS[next];
          const currentStep = PORTAL_TOUR_STEPS[current];
          if (nextStep.pathname !== currentStep.pathname) {
            setActiveTourStepIndex(next);
            navigatingRef.current = true;
            d.destroy();
            driverRef.current = null;
            router.push(nextStep.pathname);
            return;
          }
          if (PORTAL_TOUR_STEPS[next]?.openMobileNav && isMobileViewport()) {
            openMobileNav();
          }
          d.moveNext();
        },
        onPrevClick: (_element, _step, { driver: d }) => {
          const current = d.getActiveIndex() ?? 0;
          const prev = current - 1;
          if (prev < 0) return;
          const prevStep = PORTAL_TOUR_STEPS[prev];
          const currentStep = PORTAL_TOUR_STEPS[current];
          if (prevStep.pathname !== currentStep.pathname) {
            setActiveTourStepIndex(prev);
            navigatingRef.current = true;
            d.destroy();
            driverRef.current = null;
            router.push(prevStep.pathname);
            return;
          }
          if (PORTAL_TOUR_STEPS[prev]?.openMobileNav && isMobileViewport()) {
            openMobileNav();
          }
          d.movePrevious();
        },
        onCloseClick: () => {
          finishTour();
        },
        onDestroyed: () => {
          driverRef.current = null;
          if (!navigatingRef.current && !isTourSessionActive()) {
            setIsTourActive(false);
          }
        },
      });

      driverRef.current = driverObj;
      navigatingRef.current = false;
      setIsTourActive(true);
      driverObj.drive(index);
    },
    [finishTour, navigateToStep, openMobileNav, pathname, router],
  );

  const startTour = React.useCallback(() => {
    setTourSessionActive(true);
    setActiveTourStepIndex(0);
    setIsTourActive(true);
    autoStartAttemptedRef.current = true;
    navigatingRef.current = pathname !== "/portal";
    void driveAtIndex(0);
  }, [driveAtIndex, pathname]);

  const skipTour = React.useCallback(() => {
    finishTour();
  }, [finishTour]);

  React.useEffect(() => {
    if (!isTourSessionActive()) return;
    if (!navigatingRef.current) return;

    const activeIndex = getActiveTourStepIndex();
    if (activeIndex == null) return;

    const step = PORTAL_TOUR_STEPS[activeIndex];
    if (!step || step.pathname !== pathname) return;

    const timer = window.setTimeout(() => {
      void driveAtIndex(activeIndex);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [pathname, driveAtIndex]);

  React.useEffect(() => {
    if (autoStartAttemptedRef.current) return;
    if (isTourCompleted()) return;
    if (isTourSessionActive()) return;
    if (pathname !== "/portal") return;

    autoStartAttemptedRef.current = true;
    const timer = window.setTimeout(() => {
      startTour();
    }, 400);

    return () => window.clearTimeout(timer);
  }, [pathname, startTour]);

  React.useEffect(() => {
    return () => {
      driverRef.current?.destroy();
      driverRef.current = null;
    };
  }, []);

  const value = React.useMemo(
    () => ({ startTour, skipTour, isTourActive }),
    [startTour, skipTour, isTourActive],
  );

  return (
    <PortalTourContext.Provider value={value}>
      {children}
    </PortalTourContext.Provider>
  );
}

export function usePortalTourContext(): PortalTourContextValue {
  const ctx = React.useContext(PortalTourContext);
  if (!ctx) {
    throw new Error("usePortalTourContext must be used within PortalTourProvider");
  }
  return ctx;
}
