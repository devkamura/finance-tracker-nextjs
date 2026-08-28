import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // レシート画像アップロードのためデフォルト(1MB)から引き上げる
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
