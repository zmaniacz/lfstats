// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const monorepoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../");

const config = (phase: string): NextConfig => {
  const base: NextConfig = {
    experimental: {
      staleTimes: {
        dynamic: 0,
      },
    },
    images: {
      remotePatterns: [
        {
          protocol: "https",
          hostname: "lfstats-modern-images.s3.*.amazonaws.com",
        },
      ],
    },
    // Old competition route tree → merged root pages. Unmatched query params
    // (e.g. ?competition=slug) are preserved automatically by Next.
    async redirects() {
      return [
        { source: "/competitions/standings", destination: "/standings", permanent: true },
        { source: "/competitions/all-star", destination: "/all-star", permanent: true },
        {
          source: "/competitions/top-players",
          destination: "/players?scope=competition",
          permanent: true,
        },
        {
          source: "/competitions/leader-boards",
          destination: "/leaderboards?scope=competition",
          permanent: true,
        },
        {
          source: "/competitions/games",
          destination: "/games?scope=competition",
          permanent: true,
        },
        {
          source: "/competitions/penalties",
          destination: "/penalties?scope=competition",
          permanent: true,
        },
      ];
    },
  };

  if (phase === PHASE_PRODUCTION_BUILD) {
    return {
      ...base,
      output: "standalone",
      outputFileTracingRoot: monorepoRoot,
      turbopack: {
        root: monorepoRoot,
      },
    };
  }
  return base;
};

export default config;
