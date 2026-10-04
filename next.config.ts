import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 設定の最初の画面はカテゴリ。ページの描画中に redirect() すると、開発モードで
  // 「'SettingsPage' cannot have a negative time stamp」のエラーが出るため、ここで転送する
  async redirects() {
    return [
      { source: "/settings", destination: "/settings/categories", permanent: false },
    ];
  },
  experimental: {
    serverActions: {
      // レシート画像アップロードのためデフォルト(1MB)から引き上げる
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
