// Lets Node's type-stripping run the app's extensionless TS imports, which the
// Next bundler resolves natively. Test-only; does not affect the build.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
export function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !/\.[mc]?[jt]sx?$/.test(specifier)) {
    const base = fileURLToPath(new URL(specifier, context.parentURL));
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      if (existsSync(base + ext))
        return next(pathToFileURL(base + ext).href, context);
    }
  }
  return next(specifier, context);
}
