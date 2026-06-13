import axios from "axios";
import * as cheerio from "cheerio";

const MAX_PAGES = 100;
const REQUEST_DELAY_MS = 400;
const REQUEST_TIMEOUT_MS = 12000;
const FOOTER_ONLY = true;

const SKIP_URL_PARTS = [
  "/login",
  "/register",
  "/my-account",
  "/account",
  "/cart",
  "/checkout",
  "/verify",
  "/lost-password",
  "/affiliate-registration",
];

export type ScrapedSection = {
  type: string;
  text: string;
};

export type ScrapedPage = {
  url: string;
  title: string;
  sections: ScrapedSection[];
};

export type WebsiteScrapeErrorCode =
  | "INVALID_URL"
  | "SCRAPE_FAILED"
  | "NO_PAGES";

export class WebsiteScrapeError extends Error {
  readonly code: WebsiteScrapeErrorCode;

  constructor(code: WebsiteScrapeErrorCode, message: string) {
    super(message);
    this.name = "WebsiteScrapeError";
    this.code = code;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeUrl(href: string, base: string): string | null {
  try {
    const u = new URL(href, base);
    u.hash = "";
    u.search = "";
    return u.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

function isSameDomain(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

function isScrapable(url: string): boolean {
  const skip = [
    ".pdf",
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".svg",
    ".zip",
    ".mp4",
    ".mp3",
    ".webp",
    ".ico",
    ".xml",
    ".css",
    ".js",
    "mailto:",
    "tel:",
  ];
  const lower = url.toLowerCase();
  if (skip.some((s) => lower.includes(s))) return false;
  if (SKIP_URL_PARTS.some((s) => lower.includes(s))) return false;
  return true;
}

async function scrapePage(url: string): Promise<{
  url: string;
  title: string;
  sections: ScrapedSection[];
  links: string[];
  footerLinks: string[];
}> {
  const { data } = await axios.get<string>(url, {
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; KnowledgeBaseScraper/1.0)",
    },
  });

  const $ = cheerio.load(data);
  const origin = new URL(url).origin;

  const collectLinks = (selector: string): Set<string> => {
    const found = new Set<string>();
    $(selector)
      .find("a[href]")
      .each((_, el) => {
        const href = $(el).attr("href");
        const abs = href ? normalizeUrl(href, url) : null;
        if (abs && isSameDomain(abs, origin) && isScrapable(abs)) {
          found.add(abs);
        }
      });
    return found;
  };

  const links = collectLinks("body");
  let footerLinks = collectLinks(
    "footer, [role='contentinfo'], .footer, #footer",
  );
  if (footerLinks.size === 0) {
    footerLinks = links;
  }

  $("script, style, noscript, iframe, [aria-hidden='true']").remove();

  const title =
    $("title").text().trim() || $("h1").first().text().trim() || url;

  const sections: ScrapedSection[] = [];
  const h1 = $("h1").first().text().trim();
  if (h1) sections.push({ type: "h1", text: h1 });

  $("h2, h3, h4, p, li, td, th, blockquote, figcaption").each((_, el) => {
    const tag = el.tagName.toLowerCase();
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!text || text.length < 5) return;

    if (tag === "h2") sections.push({ type: "h2", text });
    else if (tag === "h3") sections.push({ type: "h3", text });
    else if (tag === "h4") sections.push({ type: "h4", text });
    else if (tag === "li") sections.push({ type: "bullet", text });
    else sections.push({ type: "body", text });
  });

  return {
    url,
    title,
    sections,
    links: Array.from(links),
    footerLinks: Array.from(footerLinks),
  };
}

/**
 * Crawl a website starting from the given URL (same-domain, footer-link discovery).
 */
export async function crawlWebsite(startUrl: string): Promise<ScrapedPage[]> {
  const normalizedStart = normalizeUrl(startUrl, startUrl);
  if (!normalizedStart) {
    throw new WebsiteScrapeError("INVALID_URL", "Invalid website URL");
  }

  const visited = new Set<string>();
  const queue = [normalizedStart];
  const results: ScrapedPage[] = [];

  while (queue.length > 0 && results.length < MAX_PAGES) {
    const url = queue.shift();
    if (!url || visited.has(url)) continue;
    visited.add(url);

    try {
      const page = await scrapePage(url);
      const nextLinks = FOOTER_ONLY
        ? results.length === 0
          ? page.footerLinks
          : []
        : page.links;

      results.push({
        url: page.url,
        title: page.title,
        sections: page.sections,
      });

      if (!FOOTER_ONLY || results.length === 1) {
        for (const link of nextLinks) {
          if (!visited.has(link) && !queue.includes(link)) {
            queue.push(link);
          }
        }
      }
    } catch {
      // Skip failed pages and continue crawling.
    }

    await sleep(REQUEST_DELAY_MS);
  }

  if (results.length === 0) {
    throw new WebsiteScrapeError(
      "NO_PAGES",
      "No pages could be scraped. Check the URL and try again.",
    );
  }

  return results;
}

/**
 * Serialize scraped pages into plain text for OpenAI extraction.
 */
export function scrapedPagesToPlainText(pages: ScrapedPage[]): string {
  const blocks: string[] = [];

  for (const page of pages) {
    const lines: string[] = [`## ${page.title}`, `URL: ${page.url}`, ""];

    for (const block of page.sections) {
      if (block.type === "h1") continue;
      if (block.type === "h2") lines.push(`### ${block.text}`, "");
      else if (block.type === "h3") lines.push(`#### ${block.text}`, "");
      else if (block.type === "h4") lines.push(`##### ${block.text}`, "");
      else if (block.type === "bullet") lines.push(`- ${block.text}`);
      else lines.push(block.text, "");
    }

    blocks.push(lines.join("\n").trim());
  }

  return blocks.join("\n\n---\n\n").trim();
}

/**
 * Validate and normalize a user-provided website URL.
 */
export function parseWebsiteUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new WebsiteScrapeError("INVALID_URL", "Invalid website URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new WebsiteScrapeError(
      "INVALID_URL",
      "URL must use http or https",
    );
  }
  return parsed.href;
}
