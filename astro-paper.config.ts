import { defineAstroPaperConfig } from "./src/types/config";

export default defineAstroPaperConfig({
  site: { url: "https://kazyamaz200.github.io/", title: "Boundary Notes", tagline: "Engineering at the Boundaries.", description: "ソフトウェア、AIエージェント、インフラ、技術探索の実践と試行錯誤を記録する個人技術ブログ。", author: "kazyamaz200", profile: "https://github.com/kazyamaz200", lang: "ja", timezone: "Asia/Tokyo", dir: "ltr" },
  posts: { perPage: 10, perIndex: 5, scheduledPostMargin: 0 },
  features: { lightAndDarkMode: true, dynamicOgImage: true, showArchives: false, showBackButton: true, editPost: { enabled: false }, search: "pagefind" },
  socials: [{ name: "github", url: "https://github.com/kazyamaz200" }],
  shareLinks: [],
});
