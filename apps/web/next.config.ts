// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const monorepoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../");

const config = (phase: string): NextConfig => {
  if (phase === PHASE_PRODUCTION_BUILD) {
    return {
      output: "standalone",
      outputFileTracingRoot: monorepoRoot,
      turbopack: {
        root: monorepoRoot,
      },
    };
  }
  return {};
};

export default config;
