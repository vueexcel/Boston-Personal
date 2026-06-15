"use client";

import * as React from "react";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import "@/components/tenant-portal/portal-tour.css";
import {
  clearPendingAgentKnowledgeTour,
  consumePendingAgentKnowledgeTour,
  getPendingAgentKnowledgeTourAgentId,
} from "@/lib/tenant-portal/agent-knowledge-tour-storage";

type UseAgentKnowledgeTourOptions = {
  agentId: string;
  setActiveTab: (tab: string) => void;
};

async function waitForElement(
  selector: string,
  timeoutMs = 3000,
): Promise<Element | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const el = document.querySelector(selector);
    if (el) return el;
    await new Promise((resolve) => window.setTimeout(resolve, 60));
  }
  return null;
}

export function useAgentKnowledgeTour({
  agentId,
  setActiveTab,
}: UseAgentKnowledgeTourOptions): void {
  const driverRef = React.useRef<Driver | null>(null);

  React.useEffect(() => {
    if (getPendingAgentKnowledgeTourAgentId() !== agentId) return;

    const timer = window.setTimeout(() => {
      void (async () => {
        const tabEl = await waitForElement('[data-tour="agent-knowledge-tab"]');
        if (!tabEl) return;
        if (!consumePendingAgentKnowledgeTour(agentId)) return;

        const driverObj = driver({
          showProgress: true,
          progressText: "{{current}} of {{total}}",
          nextBtnText: "Next",
          prevBtnText: "Back",
          doneBtnText: "Done",
          allowClose: true,
          overlayOpacity: 0.55,
          popoverClass: "bostel-driver-popover",
          steps: [
            {
              element: '[data-tour="agent-knowledge-tab"]',
              popover: {
                title: "Knowledge tab",
                description:
                  "Open the Knowledge tab to teach your agent what it should know — products, FAQs, and linked knowledge bases.",
                side: "bottom",
                align: "start",
              },
            },
            {
              element: '[data-tour="agent-knowledge-base"]',
              popover: {
                title: "Knowledge Base",
                description:
                  "Attach a tenant knowledge base so document content is included in the agent system prompt. Choose a base from the dropdown, or use Manage knowledge bases to create or import content from text, files, or your website.",
                side: "top",
                align: "start",
              },
            },
          ],
          onNextClick: (_element, _step, { driver: d }) => {
            if (d.isLastStep()) {
              clearPendingAgentKnowledgeTour();
              d.destroy();
              return;
            }
            const current = d.getActiveIndex() ?? 0;
            if (current === 0) {
              setActiveTab("knowledge");
              window.setTimeout(async () => {
                await waitForElement('[data-tour="agent-knowledge-base"]');
                d.moveNext();
              }, 180);
              return;
            }
            d.moveNext();
          },
          onCloseClick: () => {
            clearPendingAgentKnowledgeTour();
            driverRef.current?.destroy();
          },
          onDestroyed: () => {
            driverRef.current = null;
            clearPendingAgentKnowledgeTour();
          },
        });

        driverRef.current = driverObj;
        driverObj.drive();
      })();
    }, 400);

    return () => {
      window.clearTimeout(timer);
    };
  }, [agentId, setActiveTab]);

  React.useEffect(() => {
    return () => {
      driverRef.current?.destroy();
      driverRef.current = null;
    };
  }, [agentId]);
}
