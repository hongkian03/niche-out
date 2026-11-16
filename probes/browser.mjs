import { chromium } from "playwright-core";
export function launchBrowser(options = {}) {
  return chromium.launch({
    ...(process.env.PROBE_BROWSER_PATH ? { executablePath: process.env.PROBE_BROWSER_PATH } : { channel: "chrome" }),
    headless: options.headless ?? true,
    args: ["--no-proxy-server", "--disable-background-networking"]
  });
}
