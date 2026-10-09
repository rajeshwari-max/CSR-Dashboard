import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The API routes read data/dataset.json from disk at runtime. Tell Next's
  // file tracer to ship the data folder with the serverless bundle.
  outputFileTracingIncludes: {
    "/api/**": ["./data/**"],
    "/companies/**": ["./data/**"],
    "/": ["./data/**"],
  },
  logging: { fetches: { fullUrl: false } },
  // Recharts and lucide-react are barrel files with hundreds of exports; without
  // this the dev server compiles all of them on first paint.
  experimental: {
    optimizePackageImports: ["recharts", "lucide-react", "framer-motion"],
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
  webpack(config) {
    config.resolve.alias["@"] = path.join(projectDir, "src");
    return config;
  },
};

export default nextConfig;
