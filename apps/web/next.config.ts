import type { NextConfig } from "next";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: join(
    dirname(fileURLToPath(import.meta.url)),
    "../../",
  ),
  // If packages/db is consumed as raw TS rather than pre-built, add:
  // transpilePackages: ["@lfstats/db"],  // use the db package's "name" field
};

export default nextConfig;
