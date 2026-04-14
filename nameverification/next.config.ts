import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import path from "path";

// Also load `.env*` from the repo root (parent of this app) so GEMINI_API_KEY can live in NameVerification/.env
loadEnvConfig(path.join(process.cwd(), ".."));

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
