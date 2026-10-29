import { defineAstroPaperConfig } from "./src/types/config";

export default defineAstroPaperConfig({
  site: { url: "https://kazyamaz200.github.io", title: "kazyamaz200 の技術ブログ", description: "技術と開発の学びを記録するブログ", author: "kazyamaz200", profile: "https://github.com/kazyamaz200", lang: "ja", timezone: "Asia/Tokyo", dir: "ltr" },
  posts: { perPage: 10, perIndex: 5, scheduledPostMargin: 0 },
  features: { lightAndDarkMode: true, dynamicOgImage: false, showArchives: false, showBackButton: true, editPost: { enabled: false }, search: "pagefind" },
  socials: [{ name: "github", url: "https://github.com/kazyamaz200" }],
  shareLinks: [],
});
