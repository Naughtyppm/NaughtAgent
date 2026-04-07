/** Stub: utils/execFileNoThrow */
import { execFile } from "node:child_process"

export function execFileNoThrow(
  cmd: string,
  args: string[],
  options?: { timeout?: number }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: options?.timeout ?? 5000 }, (err, stdout, stderr) => {
      resolve({
        stdout: stdout?.toString() ?? "",
        stderr: stderr?.toString() ?? "",
        exitCode: err ? (err as NodeJS.ErrnoException & { code?: number }).code ?? 1 : 0,
      })
    })
  })
}
