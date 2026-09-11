import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (existsSync(".env.local")) {
  console.error(".env.local already exists; it was not changed.");
  process.exit(1);
}
const secret = randomBytes(32).toString("hex");
writeFileSync(
  ".env.local",
  `CEC_BOOTSTRAP_TOKEN=${secret}\nCEC_ORIGIN=http://localhost:3000\n`,
  { mode: 0o600 },
);
console.log(
  "Created .env.local. Start npm run dev, then use Officer setup at /cec/account.",
);
console.log("The setup key is in .env.local. It is never committed.");
