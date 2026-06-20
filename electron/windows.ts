import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CommandOutput {
  stderr: string;
  stdout: string;
}

export async function runCommand(file: string, args: string[]): Promise<CommandOutput> {
  const { stderr, stdout } = await execFileAsync(file, args, {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true
  });
  return { stderr: stderr.trim(), stdout: stdout.trim() };
}

export async function runPowerShell(script: string): Promise<CommandOutput> {
  return runCommand("powershell.exe", [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    script
  ]);
}

export function commandError(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    if ("stderr" in error && String(error.stderr).trim()) return String(error.stderr).trim();
    if ("stdout" in error && String(error.stdout).trim()) return String(error.stdout).trim();
  }
  return error instanceof Error && error.message.trim() ? error.message.trim() : fallback;
}

export function powerShellLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
