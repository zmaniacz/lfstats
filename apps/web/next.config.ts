// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const monorepoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../");

const config = (phase: string): NextConfig => {
  // These are inlined into the browser bundle at build time, so a build without them ships
  // image URLs with "undefined" in the host (see packages/db/src/lib/images.ts).
  const imagesBucket = process.env.NEXT_PUBLIC_IMAGES_BUCKET;
  const imagesRegion = process.env.NEXT_PUBLIC_AWS_REGION;
  if (phase === PHASE_PRODUCTION_BUILD && (!imagesBucket || !imagesRegion)) {
    throw new Error(
      "NEXT_PUBLIC_IMAGES_BUCKET and NEXT_PUBLIC_AWS_REGION must be set when building the web app",
    );
  }

  const base: NextConfig = {
    experimental: {
      staleTimes: {
        dynamic: 0,
      },
    },
    images: {
      remotePatterns:
        imagesBucket && imagesRegion
          ? [{ protocol: "https", hostname: `${imagesBucket}.s3.${imagesRegion}.amazonaws.com` }]
          : [],
    },
    // The OAuth consent page must not be framed, or a page could overlay it and trick a
    // signed-in user into clicking Allow.
    async headers() {
      return [
        {
          source: "/oauth/:path*",
          headers: [
            { key: "X-Frame-Options", value: "DENY" },
            { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          ],
        },
      ];
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
