import { spawn } from "node:child_process";

const DESKTOP_COMMAND_TIMEOUT_MS = 10_000;

const normalizeString = (value) => {
  if (value?.constructor !== String) return null;

  const text = value.trim();

  return text || null;
};

export const desktopSessionFromEnvironment = (env = process.env) => {
  const thread = normalizeString(env.CODEX_THREAD_ID);
  const appToolsPipe = normalizeString(env.CODEX_APP_TOOLS_PIPE_PATH);

  if (!thread || !appToolsPipe) return null;

  return {
    thread,
    appToolsPipe,
  };
};

const run = (
  command,
  args,
  env,
  timeoutMs,
  label,
) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    env,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let stdout = "";
  let stderr = "";
  let settled = false;

  const finish = (error, output) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);

    if (error) reject(error);
    else resolve(output);
  };

  const timeout = setTimeout(() => {
    if (child.exitCode === null) child.kill("SIGTERM");

    finish(new Error(`${label} timed out after ${timeoutMs}ms.`));
  }, timeoutMs);

  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  child.on("error", (error) => finish(error));
  child.on("close", (code, signal) => {
    if (code === 0) {
      finish(null, stdout.trim());

      return;
    }

    const detail = stderr.trim()
      || stdout.trim()
      || `exit code ${code ?? "unknown"}${signal ? ` (${signal})` : ""}`;

    finish(new Error(`${label} failed: ${detail}`));
  });
});

const queuedSubmissionId = (output, thread) => {
  const escapedThread = thread.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exact = output.match(new RegExp(
    `Queued message\\s+(\\S+)\\s+for thread\\s+${escapedThread}\\.?`,
  ));

  if (exact?.[1]) return exact[1];

  const generic = output.match(/Queued message\s+(\S+)\s+for thread\s+\S+\.?/);

  return generic?.[1] ?? null;
};

export const queueDesktopThread = async ({
  command,
  thread,
  message,
  env = process.env,
}) => {
  const output = await run(
    command,
    ["queue", "--thread", thread, "--message", message],
    env,
    DESKTOP_COMMAND_TIMEOUT_MS,
    "Codex Desktop queue",
  );

  const submissionId = queuedSubmissionId(output, thread);

  if (!submissionId) {
    throw new Error("Codex queued the Desktop message without a recognizable submission id.");
  }

  return {
    output,
    queuedSubmissionId: submissionId,
  };
};

export const openDesktopThread = async ({
  thread,
  env = process.env,
  platform = process.platform,
}) => {
  const url = `codex://threads/${thread}`;
  const override = normalizeString(env.MESURER_CODEX_DESKTOP_OPEN_BIN);

  let command;
  let args;

  if (override) {
    command = override;
    args = [url];
  } else if (platform === "darwin") {
    command = "/usr/bin/open";
    args = [url];
  } else if (platform === "win32") {
    command = "powershell.exe";
    const quotedUrl = url.replaceAll("'", "''");

    args = [
      "-NoProfile",
      "-Command",
      `Start-Process -FilePath '${quotedUrl}'`,
    ];
  } else {
    throw new Error(`Codex Desktop thread wake is unsupported on platform ${platform}.`);
  }

  await run(
    command,
    args,
    env,
    DESKTOP_COMMAND_TIMEOUT_MS,
    "Codex Desktop thread wake",
  );

  return url;
};
