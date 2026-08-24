// The routes that spawn a process on the host machine.
//
// These are paused work, not dead work — the auto-extraction pipeline may be
// resumed — so they are gated rather than deleted. Two independent gates:
//
//   LOCAL_TOOLS_ENABLED  must be exactly "true". Unset means off, so a deployment
//                        that never heard of this flag cannot be spawning
//                        processes for anonymous callers.
//   PYTHON_EXE / ODA_CONVERTER_EXE  must name the executable. There used to be a
//                        hardcoded C:\Users\dandu\...\python.exe fallback and a
//                        scan of C:\Program Files\ODA — one developer's machine
//                        baked into the product, which silently "worked" on that
//                        machine and failed inscrutably everywhere else. Now the
//                        path is configuration, and its absence is a legible error.

import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { unavailable } from "./http";

export const localToolsEnabled = () => process.env.LOCAL_TOOLS_ENABLED === "true";

/** Returns a 503 to hand straight back, or null when local tooling is switched on. */
export function localToolsGate(feature: string): Response | null {
  if (localToolsEnabled()) return null;
  return unavailable(
    `${feature} is not available on this deployment`,
    "this endpoint shells out to a local tool and is disabled by default; set LOCAL_TOOLS_ENABLED=true on a machine that has it installed",
  );
}

export type ExeResult = { ok: true; path: string } | { ok: false; response: Response };

/**
 * Resolve a configured executable path. An absolute path is checked for existence
 * so misconfiguration is caught before a spawn; a bare command name is left to
 * PATH resolution (which we cannot stat).
 */
export async function requireExe(envVar: string, what: string): Promise<ExeResult> {
  const configured = process.env[envVar]?.trim();
  if (!configured) {
    return {
      ok: false,
      response: unavailable(
        `${what} is not configured`,
        `set ${envVar} to the full path of the ${what} executable`,
      ),
    };
  }
  const looksLikePath = /[\\/]/.test(configured);
  if (looksLikePath) {
    try {
      await access(configured, constants.X_OK).catch(() => access(configured));
    } catch {
      return {
        ok: false,
        response: unavailable(
          `${what} was not found`,
          `${envVar} points at ${configured}, which does not exist or is not executable`,
        ),
      };
    }
  }
  return { ok: true, path: configured };
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
}

/**
 * Spawn a tool and collect its output with a ceiling on both time and memory.
 *
 * The previous versions of these routes pushed every stdout chunk into an array
 * with no limit and waited for `close` with no timeout — so a tool that streamed
 * or hung held the request (and its heap) for as long as it liked. Arguments are
 * passed as an array and never through a shell, so no input can become a command.
 */
export function runTool(
  exe: string,
  args: string[],
  opts: { timeoutMs?: number; maxOutputBytes?: number } = {},
): Promise<RunResult> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const maxOutputBytes = opts.maxOutputBytes ?? 32 * 1024 * 1024;

  return new Promise<RunResult>((resolve) => {
    const child = spawn(exe, args, { windowsHide: true, shell: false });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let outBytes = 0;
    let errBytes = 0;
    let truncated = false;
    let timedOut = false;
    let settled = false;

    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        code,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
        timedOut,
        truncated,
      });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
      finish(-1);
    }, timeoutMs);

    child.stdout.on("data", (d: Buffer) => {
      outBytes += d.byteLength;
      if (outBytes > maxOutputBytes) {
        truncated = true;
        child.kill("SIGKILL");
        return;
      }
      out.push(d);
    });
    child.stderr.on("data", (d: Buffer) => {
      errBytes += d.byteLength;
      if (errBytes > 64 * 1024) return; // stderr is only ever for a short message
      err.push(d);
    });
    child.on("error", (e) => {
      err.push(Buffer.from(String(e)));
      finish(-1);
    });
    child.on("close", (code) => finish(code ?? -1));
  });
}
