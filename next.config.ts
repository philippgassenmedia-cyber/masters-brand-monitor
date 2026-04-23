import { execSync } from "child_process";
import type { NextConfig } from "next";

let localSha = "local";
try {
  localSha = execSync("git rev-parse --short HEAD").toString().trim();
} catch {}

const nextConfig: NextConfig = {
  env: {
    BUILD_SHA: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? localSha,
  },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
