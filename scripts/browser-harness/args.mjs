const nextValue = (argv, index, flag) => {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
};

const parseJson = (value, flag) => {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${flag} must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export function parseBrowserHarnessArgs(argv) {
  const options = {
    url: null,
    cdp: null,
    page: null,
    injectPath: null,
    globalName: "__MESURER__",
    target: null,
    headless: false,
    autoInject: true,
    listPages: false,
    serve: false,
    port: 4747,
    token: null,
    stdio: false,
    once: null,
    params: {},
    screenshotDir: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--headless") {
      options.headless = true;
    } else if (arg === "--headed") {
      options.headless = false;
    } else if (arg === "--no-auto-inject") {
      options.autoInject = false;
    } else if (arg === "--list-pages") {
      options.listPages = true;
    } else if (arg === "--stdio") {
      options.stdio = true;
    } else if (arg === "--serve") {
      options.serve = true;
      const possiblePort = argv[index + 1];
      if (possiblePort && /^\d+$/.test(possiblePort)) {
        options.port = Number(possiblePort);
        index += 1;
      }
    } else if (arg === "--port") {
      options.port = Number(nextValue(argv, index, arg));
      index += 1;
    } else if (arg === "--cdp") {
      options.cdp = nextValue(argv, index, arg);
      index += 1;
    } else if (arg === "--page") {
      options.page = nextValue(argv, index, arg);
      index += 1;
    } else if (arg === "--inject") {
      options.injectPath = nextValue(argv, index, arg);
      index += 1;
    } else if (arg === "--global-name") {
      options.globalName = nextValue(argv, index, arg);
      index += 1;
    } else if (arg === "--target") {
      options.target = nextValue(argv, index, arg);
      index += 1;
    } else if (arg === "--token") {
      options.token = nextValue(argv, index, arg);
      index += 1;
    } else if (arg === "--once") {
      options.once = nextValue(argv, index, arg);
      index += 1;
    } else if (arg === "--params") {
      options.params = parseJson(nextValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === "--screenshot-dir") {
      options.screenshotDir = nextValue(argv, index, arg);
      index += 1;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (options.url === null) {
      options.url = arg;
    } else {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error(`--port must be an integer between 1 and 65535, received ${options.port}`);
  }
  if (options.params === null || typeof options.params !== "object" || Array.isArray(options.params)) {
    throw new Error("--params must decode to a JSON object");
  }

  return options;
}

export const BROWSER_HARNESS_USAGE = `Mesurer Solid browser harness

Usage:
  bun run browser:harness -- [url] [options]

Examples:
  bun run browser:harness -- https://example.com
  bun run browser:harness -- http://localhost:5173 --serve
  bun run browser:harness -- --cdp http://127.0.0.1:9222 --list-pages
  bun run browser:harness -- --cdp http://127.0.0.1:9222 --page 1 --serve 4747
  bun run browser:harness -- https://example.com --stdio
  bun run browser:harness -- https://example.com --headless --once mesurer.inspect --params '{"selector":"h1"}'

Options:
  --headless                 Launch Chromium without a visible window.
  --headed                   Launch Chromium visibly (default).
  --cdp <url>                Attach to an existing Chromium CDP endpoint.
  --page <index|text>        Select an attached tab by index or URL/title substring.
  --list-pages               Print attached tabs and exit without injecting.
  --inject <path>            Override the Mesurer inject.js bundle path.
  --global-name <name>       Agent global name (default: __MESURER__).
  --target <selector>        Mount Mesurer into a specific host element.
  --no-auto-inject           Do not inject/reinject automatically.
  --serve [port]             Start authenticated loopback HTTP RPC (default port 4747).
  --port <port>              Set the HTTP RPC port.
  --token <token>            Use a fixed HTTP bearer token instead of a random token.
  --stdio                    Read/write newline-delimited JSON RPC on stdin/stdout.
  --once <method>            Run one RPC method, print JSON, and exit.
  --params <json>            Parameters for --once.
  --screenshot-dir <path>    Default directory for browser.screenshot output.
  --help                     Show this help.
`;
