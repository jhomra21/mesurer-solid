import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_INJECT_PATH = path.resolve(here, "../../packages/mesurer/dist/inject-script.js");

const unsupportedUrl = (url) => /^(chrome|edge|devtools|view-source):/i.test(url);

export const normalizeBrowserUrl = (value) => {
  if (!value) return null;
  const input = String(value).trim();
  if (!input) return null;
  if (/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(input)) return new URL(`http://${input}`).href;
  if (/^[a-z][a-z\d+.-]*:/i.test(input)) return new URL(input).href;
  if (!/\s/.test(input)) return new URL(`https://${input}`).href;
  throw new Error(`Invalid URL: ${value}`);
};

const toAbsolute = (value) => path.resolve(process.cwd(), value);

export class BrowserHarnessSession {
  constructor(options = {}) {
    this.options = {
      url: options.url ? normalizeBrowserUrl(options.url) : null,
      cdp: options.cdp ?? null,
      page: options.page ?? null,
      injectPath: options.injectPath ? toAbsolute(options.injectPath) : DEFAULT_INJECT_PATH,
      globalName: options.globalName ?? "__MESURER__",
      target: options.target ?? null,
      headless: options.headless ?? false,
      autoInject: options.autoInject ?? true,
    };
    this.browser = null;
    this.context = null;
    this.page = null;
    this.ownsBrowser = false;
    this.started = false;
    this.pageIds = new WeakMap();
    this.nextPageId = 1;
    this.injectSource = null;
    this.disconnected = new Promise((resolve) => { this.resolveDisconnected = resolve; });
  }

  async start() {
    if (this.started) return this.status();
    if (this.options.cdp) {
      this.browser = await chromium.connectOverCDP(this.options.cdp);
      this.ownsBrowser = false;
      this.context = this.browser.contexts()[0] ?? await this.browser.newContext();
    } else {
      this.browser = await chromium.launch({ headless: this.options.headless });
      this.ownsBrowser = true;
      this.context = await this.browser.newContext({ bypassCSP: true });
    }

    this.browser.on("disconnected", () => this.resolveDisconnected?.());
    for (const context of this.browser.contexts()) {
      for (const page of context.pages()) this.registerPage(page);
      context.on("page", (page) => this.registerPage(page));
    }

    const pages = this.flattenPages();
    this.page = pages.length ? await this.pickPage(this.options.page, pages) : await this.context.newPage();
    this.registerPage(this.page);
    this.started = true;

    if (this.options.url) {
      await this.page.goto(this.options.url, { waitUntil: "domcontentloaded" });
    }
    if (this.options.autoInject && !unsupportedUrl(this.page.url()) && this.page.url() !== "about:blank") await this.inject();
    return this.status();
  }

  async loadInjectSource() {
    if (this.injectSource) return this.injectSource;
    try { await access(this.options.injectPath); }
    catch { throw new Error(`Mesurer injection script not found at ${this.options.injectPath}. Run \`bun run build\` first or pass --inject <path>.`); }
    this.injectSource = await readFile(this.options.injectPath, "utf8");
    return this.injectSource;
  }

  registerPage(page) {
    if (!this.pageIds.has(page)) this.pageIds.set(page, this.nextPageId++);
  }

  flattenPages() {
    return this.browser ? this.browser.contexts().flatMap((context) => context.pages()) : [];
  }

  async pickPage(selector, pages = this.flattenPages()) {
    if (!pages.length) throw new Error("No browser tabs are available");
    if (selector === null || selector === undefined || selector === "") return pages[0];
    if (/^\d+$/.test(String(selector))) {
      const page = pages[Number(selector)];
      if (!page) throw new Error(`No browser tab exists at index ${selector}`);
      return page;
    }
    const needle = String(selector).toLowerCase();
    for (const page of pages) {
      const title = await page.title().catch(() => "");
      if (page.url().toLowerCase().includes(needle) || title.toLowerCase().includes(needle)) return page;
    }
    throw new Error(`No browser tab matched ${JSON.stringify(selector)}`);
  }

  async inject() {
    if (!this.page || this.page.isClosed()) throw new Error("No active browser tab is selected");
    if (unsupportedUrl(this.page.url())) throw new Error(`Browser-internal pages cannot be injected: ${this.page.url()}`);
    const source = await this.loadInjectSource();
    await this.page.evaluate(({ globalName, target }) => {
      globalThis.__MESURER_CONFIG__ = { ...(globalThis.__MESURER_CONFIG__ ?? {}), globalName, ...(target ? { target } : {}) };
    }, { globalName: this.options.globalName, target: this.options.target });
    // Deliberately use plain JavaScript evaluation rather than addScriptTag().
    // This mirrors the primitive already exposed by agent browser tools.
    await this.page.evaluate(source);
    await this.page.evaluate(async (globalName) => { await globalThis[globalName].ready(); }, this.options.globalName);
    return this.status();
  }

  async status() {
    const page = this.page;
    const injected = page && !page.isClosed()
      ? await page.evaluate((globalName) => typeof globalThis[globalName]?.ready === "function", this.options.globalName).catch(() => false)
      : false;
    return {
      connected: Boolean(this.browser?.isConnected()),
      mode: this.options.cdp ? "cdp" : "launch",
      globalName: this.options.globalName,
      page: page && !page.isClosed() ? { url: page.url(), title: await page.title().catch(() => "") } : null,
      injected,
    };
  }

  async pages() {
    return Promise.all(this.flattenPages().map(async (page, index) => ({
      index,
      id: this.pageIds.get(page) ?? null,
      selected: page === this.page,
      url: page.url(),
      title: await page.title().catch(() => ""),
    })));
  }

  async close() {
    if (this.browser?.isConnected()) {
      if (this.ownsBrowser) await this.browser.close();
      else {
        const connection = this.browser._connection;
        if (connection && typeof connection.close === "function") connection.close();
      }
    }
    this.resolveDisconnected?.();
  }

  async waitForDisconnect() { return this.disconnected; }
}
