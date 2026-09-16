import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
export function quant(input: unknown): Promise<any> {
  return new Promise((yes, no) => {
    const script =
      process.env.CEC_QUANT_SCRIPT ||
      resolve(process.cwd(), "../services/quant/bridge.py");
    const child = spawn(process.env.PYTHON_BINARY || "python3", [script], {
      env: {
        ...process.env,
        CEC_QUANT_DATABASE: resolve(
          dirname(
            process.env.CEC_DATABASE ||
              resolve(process.cwd(), ".data/cec.sqlite"),
          ),
          "quant.sqlite",
        ),
      },
    });
    let output = "",
      error = "";
    const timer = setTimeout(() => {
      child.kill();
      no(new Error("Quant engine timed out."));
    }, 15000);
    child.stdout.on("data", (b) => (output += b));
    child.stderr.on("data", (b) => (error += b));
    child.on("error", (e) => {
      clearTimeout(timer);
      no(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0)
        return no(
          new Error(
            "Quant engine is unavailable. Check the service configuration.",
          ),
        );
      try {
        yes(JSON.parse(output));
      } catch {
        no(new Error("Invalid quant response."));
      }
    });
    child.stdin.end(JSON.stringify(input));
  });
}
let flushing: Promise<void> | null = null;
export async function flush(force = false) {
  if (flushing) return flushing;
  flushing = new Promise<void>((yes, no) => {
    const child = spawn(process.env.PYTHON_BINARY || "python3", [
      resolve(process.cwd(), "../services/quant/pipeline.py"), force ? "retry" : "once",
    ], { env: process.env, stdio: ["ignore", "ignore", "ignore"] });
    child.on("error", no);
    child.on("close", (code) => code === 0 ? yes() : no(new Error("Pipeline worker unavailable.")));
  }).catch(() => {
    // The domain transaction is already committed. The worker will retry later.
  }).finally(() => { flushing = null; });
  return flushing;
}
