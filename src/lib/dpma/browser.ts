import { chromium } from "playwright-core";
import type { Browser, BrowserContext } from "playwright-core";

const IS_SERVERLESS = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

export async function launchBrowser(): Promise<Browser> {
  if (IS_SERVERLESS) {
    // Vercel/Lambda: nutze gebündeltes Chromium das direkt auf dem Server läuft
    const sparticuz = await import("@sparticuz/chromium");
    const executablePath = await sparticuz.default.executablePath();
    return chromium.launch({
      executablePath,
      headless: true,
      args: [
        ...sparticuz.default.args,
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
  }

  // Lokal: System-Chrome nutzen
  return chromium.launch({
    headless: true,
    channel: "chrome",
    args: [
      "--headless=new",
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
    ],
  });
}

export async function createStealthContext(browser: Browser): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  return ctx;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function addStealthScripts(page: { addInitScript: (fn: () => void) => Promise<any> }) {
  return page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    (window as unknown as Record<string, unknown>).chrome = { runtime: {} };
  });
}
