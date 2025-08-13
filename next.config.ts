import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mongodb"], // ✅ moved out of experimental
};

export default nextConfig;
