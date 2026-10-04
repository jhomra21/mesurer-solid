import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const root = path.resolve(here, "../..");

const serverPath = path.join(here, "server.mjs");

const startServer = () => {
  const child = spawn(process.execPath, [serverPath], {
    cwd: root,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const lines = readline.createInterface({
    input: child.stdout,
    crlfDelay: Infinity,
  });

  const pending = new Map();

  lines.on("line", (line) => {
    const message = JSON.parse(line);
    const waiter = pending.get(message.id);

    if (!waiter) return;
    pending.delete(message.id);
    waiter.resolve(message);
  });

  let nextId = 1;

  const request = (method, params) => {
    const id = nextId++;
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);

    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
  };

  const close = async () => {
    lines.close();

    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
  };

  return { child, request, close };
};

test("Mesurer plugin manifest reuses the canonical agent skill", async () => {
  const manifest = JSON.parse(await readFile(path.join(root, ".codex-plugin/plugin.json"), "utf8"));
  const mcp = JSON.parse(await readFile(path.join(root, ".mcp.json"), "utf8"));
  const marketplace = JSON.parse(await readFile(path.join(root, ".agents/plugins/marketplace.json"), "utf8"));
  const portableManifest = JSON.parse(await readFile(path.join(root, "plugin.json"), "utf8"));
  const portableMcp = JSON.parse(await readFile(path.join(root, "mcp.json"), "utf8"));
  const repositorySkill = await readFile(path.join(root, ".agents/skills/mesurer-ui/SKILL.md"), "utf8");
  const portableSkill = await readFile(path.join(root, "skills/mesurer-ui/SKILL.md"), "utf8");
  const packagedSkill = await readFile(path.join(root, "packages/mesurer/skills/mesurer-ui/SKILL.md"), "utf8");

  assert.equal(manifest.name, "mesurer-solid");
  assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.mcpServers, "./.mcp.json");
  assert.deepEqual(mcp.mcpServers["mesurer-local"], {
    cwd: ".",
    command: "node",
    args: ["./scripts/mesurer-mcp/server.mjs"],
  });
  assert.equal(marketplace.plugins[0]?.source?.path, ".");
  assert.equal(portableManifest.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
  assert.equal(portableManifest.name, "mesurer-solid");
  assert.equal(portableMcp.mcpServers["mesurer-local"].type, "stdio");
  assert.equal(portableMcp.mcpServers["mesurer-local"].cwd, "./");
  assert.equal(repositorySkill, portableSkill);
  assert.equal(repositorySkill, packagedSkill);
});

test("local MCP server advertises the focused Mesurer shortcut surface", async () => {
  const server = startServer();

  try {
    const initialized = await server.request("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "mesurer-test", version: "0.0.0" },
    });

    assert.equal(initialized.result.serverInfo.name, "Mesurer Solid Local");
    assert.match(initialized.result.instructions, /UI-first/);

    const listed = await server.request("tools/list");
    const tools = listed.result.tools;
    const names = tools.map((tool) => tool.name);

    assert.deepEqual(names, [
      "connect_mesurer_page",
      "list_browser_pages",
      "get_mesurer_status",
      "inspect_ui",
      "measure_ui",
      "get_ui_context",
      "select_ui",
      "use_mesurer_tool",
      "get_saved_ui_intent",
      "set_mesurer_plugin",
      "review_ui",
    ]);

    for (const tool of tools) {
      assert.equal(tool.description?.constructor, String);
      assert.ok(tool.description.length > 20);
      assert.equal(tool.inputSchema.type, "object");
      assert.equal(tool.annotations.openWorldHint?.constructor, Boolean);
    }

    assert.equal(
      tools.find((tool) => tool.name === "connect_mesurer_page")?.annotations.openWorldHint,
      true,
    );
    assert.equal(
      tools.filter((tool) => tool.name !== "connect_mesurer_page")
        .every((tool) => tool.annotations.openWorldHint === false),
      true,
    );

    const status = await server.request("tools/call", {
      name: "get_mesurer_status",
      arguments: {},
    });

    assert.equal(status.result.structuredContent.connected, false);
    assert.match(status.result.structuredContent.message, /existing browser harness/);

    const pages = await server.request("tools/call", {
      name: "list_browser_pages",
      arguments: {},
    });

    assert.deepEqual(pages.result.structuredContent.pages, []);
    assert.match(pages.result.structuredContent.message, /browser harness/);

    const unavailable = await server.request("tools/call", {
      name: "inspect_ui",
      arguments: { selector: "body" },
    });

    assert.equal(unavailable.result.isError, true);
    assert.match(unavailable.result.content[0]?.text, /connect_mesurer_page/);
  } finally {
    await server.close();
  }
});
