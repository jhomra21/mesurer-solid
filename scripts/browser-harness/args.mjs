const nextValue = (argv, index, flag) => {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
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
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--headless") options.headless = true;
    else if (arg === "--headed") options.headless = false;
    else if (arg === "--no-auto-inject") options.autoInject = false;
    else if (arg === "--list-pages") options.listPages = true;
    else if (arg === "--cdp") { options.cdp = nextValue(argv, index, arg); index += 1; }
    else if (arg === "--page") { options.page = nextValue(argv, index, arg); index += 1; }
    else if (arg === "--inject") { options.injectPath = nextValue(argv, index, arg); index += 1; }
    else if (arg === "--global-name") { options.globalName = nextValue(argv, index, arg); index += 1; }
    else if (arg === "--target") { options.target = nextValue(argv, index, arg); index += 1; }
    else if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
    else if (options.url === null) options.url = arg;
    else throw new Error(`Unexpected positional argument: ${arg}`);
  }

  return options;
}

export const BROWSER_HARNESS_USAGE = `Mesurer Solid reference browser harness

This CLI is optional development tooling. Coding agents should normally use their
existing browser/CDP tool and evaluate mesurer-solid/inject-script.

Usage:
  bun run browser:harness -- [url] [options]

Examples:
  bun run browser:harness -- https://example.com
  bun run browser:harness -- --cdp http://127.0.0.1:9222 --list-pages
  bun run browser:harness -- --cdp http://127.0.0.1:9222 --page 1

Options:
  --headless                 Launch Chromium without a visible window.
  --headed                   Launch Chromium visibly (default).
  --cdp <url>                Attach to an existing Chromium CDP endpoint.
  --page <index|text>        Select an attached tab by index or URL/title substring.
  --list-pages               Print attached tabs and exit without injecting.
  --inject <path>            Override the classic inject-script.js payload path.
  --global-name <name>       Agent global name (default: __MESURER__).
  --target <selector>        Mount Mesurer into a specific host element.
  --no-auto-inject           Do not inject/reinject automatically.
  --help                     Show this help.
`;
