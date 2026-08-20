import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_INJECT_PATH = path.resolve(here, "../../packages/mesurer/dist/inject.js");

const unsupportedUrl = (url) => /^(chrome|edge|devtools|view-source):/i.test(url);
const normalizeUrl = (value) => {
  if (!value) return null;
  try {
    return new URL(value).href;
  } catch {
    if (/^[\w.-]+:\d+(?:\/|$)/.test(value) || value.startsWith("localhost")) {
      return new URL(`http://${value}`).href;
    }
    throw new Error(`Invalid URL: ${value}`);
  }
};

const toAbsolute = (value) => path.resolve(process.cwd(), value);

export class BrowserHarnessSession {
  constructor(options = {}) {
    this.options = {
      url: options.url ? normalizeUrl(options.url) : null,
      cdp: options.cdp ?? null,
      page: options.page ?? null,
      injectPath: options.injectPath ? toAbsolute(options.injectPath) : DEFAULT_INJECT_PATH,
      globalName: options.globalName ?? "__MESURER__",
      target: options.target ?? null,
      headless: options.headless ?? false,
      autoInject: options.autoInject ?? true,
      screenshotDir: options.screenshotDir ? toAbsolute(options.screenshotDir) : path.resolve(process.cwd(), "artifacts/mesurer-browser"),
    };
    this.browser = null;
    this.context = null;
    this.page = null;
    this.ownsBrowser = false;
    this.started = false;
    this.pageIds = new WeakMap();
    this.nextPageId = 1;
    this.injecting = new WeakMap();
    this.cdpSessions = new WeakMap();
    this.disconnected = new Promise((resolve) => { this.resolveDisconnected = resolve; });
  }

  async start() {
    if (this.started) return this.status();
    await this.ensureInjectBundle();

    if (this.options.cdp) {
      this.browser = await chromium.connectOverCDP(this.options.cdp);
      this.ownsBrowser = false;
      const contexts = this.browser.contexts();
      this.context = contexts[0] ?? await this.browser.newContext();
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
    if (pages.length === 0) {
      this.page = await this.context.newPage();
      this.registerPage(this.page);
    } else {
      this.page = await this.pickPage(this.options.page, pages);
    }

    this.started = true;

    if (this.options.url) {
      await this.navigate(this.options.url);
    } else if (this.options.autoInject && !unsupportedUrl(this.page.url())) {
      await this.inject().catch((error) => {
        if (this.page.url() !== "about:blank") throw error;
      });
    }

    return this.status();
  }

  async ensureInjectBundle() {
    try {
      await access(this.options.injectPath);
    } catch {
      throw new Error(
        `Mesurer injection bundle not found at ${this.options.injectPath}. Run \`bun run build\` first or pass --inject <path>.`,
      );
    }
  }

  registerPage(page) {
    if (!this.pageIds.has(page)) this.pageIds.set(page, this.nextPageId++);
    page.on("domcontentloaded", () => {
      if (!this.started || !this.options.autoInject || page !== this.page || unsupportedUrl(page.url())) return;
      void this.injectInto(page).catch(() => {});
    });
  }

  flattenPages() {
    if (!this.browser) return [];
    return this.browser.contexts().flatMap((context) => context.pages());
  }

  async pickPage(selector, pages = this.flattenPages()) {
    if (!pages.length) throw new Error("No browser tabs are available");
    if (selector === null || selector === undefined || selector === "") return pages[0];

    if (/^\d+$/.test(String(selector))) {
      const index = Number(selector);
      if (!pages[index]) throw new Error(`No browser tab exists at index ${index}`);
      return pages[index];
    }

    const needle = String(selector).toLowerCase();
    for (const page of pages) {
      const title = await page.title().catch(() => "");
      if (page.url().toLowerCase().includes(needle) || title.toLowerCase().includes(needle)) return page;
    }
    throw new Error(`No browser tab matched ${JSON.stringify(selector)}`);
  }

  async enableCspBypass(page) {
    if (this.ownsBrowser) return;
    if (this.cdpSessions.has(page)) return;
    try {
      const session = await page.context().newCDPSession(page);
      await session.send("Page.setBypassCSP", { enabled: true });
      this.cdpSessions.set(page, session);
    } catch {
      // connectOverCDP is Chromium-only, but a page can disappear between
      // selection and attachment. The subsequent injection produces the useful error.
    }
  }

  async injectInto(page) {
    const existing = this.injecting.get(page);
    if (existing) return existing;
    const promise = this.performInjection(page).finally(() => this.injecting.delete(page));
    this.injecting.set(page, promise);
    return promise;
  }

  async performInjection(page) {
    if (page.isClosed()) throw new Error("Selected browser tab is closed");
    const url = page.url();
    if (unsupportedUrl(url)) throw new Error(`Browser-internal pages cannot be injected: ${url}`);

    await this.enableCspBypass(page);
    await page.evaluate(({ globalName, target }) => {
      globalThis.__MESURER_CONFIG__ = {
        ...(globalThis.__MESURER_CONFIG__ ?? {}),
        globalName,
        ...(target ? { target } : {}),
      };
    }, { globalName: this.options.globalName, target: this.options.target });

    await page.addScriptTag({ path: this.options.injectPath, type: "module" });
    await page.waitForFunction(
      (globalName) => typeof globalThis[globalName]?.ready === "function",
      this.options.globalName,
      { timeout: 15_000 },
    );
    await page.evaluate(async (globalName) => {
      await globalThis[globalName].ready();
    }, this.options.globalName);
    return this.status();
  }

  async ensureInjected() {
    this.requirePage();
    const injected = await this.page.evaluate((globalName) => typeof globalThis[globalName]?.ready === "function", this.options.globalName);
    if (!injected) await this.inject();
  }

  requirePage() {
    if (!this.page || this.page.isClosed()) throw new Error("No active browser tab is selected");
    return this.page;
  }

  async status() {
    const page = this.page;
    if (!page || page.isClosed()) {
      return { started: this.started, connected: Boolean(this.browser), page: null, injected: false };
    }
    const injected = await page.evaluate((globalName) => typeof globalThis[globalName]?.ready === "function", this.options.globalName).catch(() => false);
    return {
      started: this.started,
      connected: Boolean(this.browser?.isConnected()),
      mode: this.options.cdp ? "cdp" : "launch",
      autoInject: this.options.autoInject,
      injectPath: this.options.injectPath,
      globalName: this.options.globalName,
      page: {
        id: this.pageIds.get(page) ?? null,
        url: page.url(),
        title: await page.title().catch(() => ""),
      },
      injected,
    };
  }

  async pages() {
    const pages = this.flattenPages();
    return Promise.all(pages.map(async (page, index) => ({
      index,
      id: this.pageIds.get(page) ?? null,
      selected: page === this.page,
      url: page.url(),
      title: await page.title().catch(() => ""),
    })));
  }

  async selectPage(selector) {
    const page = await this.pickPage(selector);
    this.page = page;
    if (this.options.autoInject && !unsupportedUrl(page.url())) await this.ensureInjected();
    return this.status();
  }

  async navigate(value) {
    const page = this.requirePage();
    const url = normalizeUrl(value);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    if (this.options.autoInject) await this.ensureInjected();
    return this.status();
  }

  async back() {
    const page = this.requirePage();
    await page.goBack({ waitUntil: "domcontentloaded" });
    if (this.options.autoInject) await this.ensureInjected();
    return this.status();
  }

  async forward() {
    const page = this.requirePage();
    await page.goForward({ waitUntil: "domcontentloaded" });
    if (this.options.autoInject) await this.ensureInjected();
    return this.status();
  }

  async reload() {
    const page = this.requirePage();
    await page.reload({ waitUntil: "domcontentloaded" });
    if (this.options.autoInject) await this.ensureInjected();
    return this.status();
  }

  async inject() {
    return this.injectInto(this.requirePage());
  }

  async callAgent(method, args = []) {
    await this.ensureInjected();
    return this.page.evaluate(async ({ globalName, method, args }) => {
      const api = globalThis[globalName];
      if (!api) throw new Error(`Mesurer agent global ${globalName} is not available`);
      const fn = api[method];
      if (typeof fn !== "function") throw new Error(`Mesurer agent method is not available: ${method}`);
      return await fn.apply(api, args);
    }, { globalName: this.options.globalName, method, args });
  }

  async click(selector, index = 0) {
    const page = this.requirePage();
    await page.locator(selector).nth(index).click();
    return { selector, index };
  }

  async hover(selector, index = 0) {
    const page = this.requirePage();
    await page.locator(selector).nth(index).hover();
    return { selector, index };
  }

  async fill(selector, value, index = 0) {
    const page = this.requirePage();
    await page.locator(selector).nth(index).fill(value);
    return { selector, index, value };
  }

  async press(key, selector = null, index = 0) {
    const page = this.requirePage();
    if (selector) await page.locator(selector).nth(index).press(key);
    else await page.keyboard.press(key);
    return { key, selector, index };
  }

  async screenshot({ path: requestedPath = null, fullPage = false } = {}) {
    const page = this.requirePage();
    await mkdir(this.options.screenshotDir, { recursive: true });
    const filename = requestedPath
      ? toAbsolute(requestedPath)
      : path.join(this.options.screenshotDir, `mesurer-${new Date().toISOString().replace(/[:.]/g, "-")}.png`);
    await mkdir(path.dirname(filename), { recursive: true });
    await page.screenshot({ path: filename, fullPage });
    return { path: filename, fullPage, url: page.url() };
  }

  async close() {
    if (this.ownsBrowser && this.browser?.isConnected()) await this.browser.close();
    this.resolveDisconnected?.();
  }

  async waitForDisconnect() {
    return this.disconnected;
  }
}
