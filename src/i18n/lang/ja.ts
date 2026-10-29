import type { UIStrings } from "../types";

export default {
  nav: {
    home: "Home",
    posts: "記事",
    tags: "タグ",
    about: "About",
    archives: "Archives",
    search: "検索",
  },
  post: {
    publishedAt: "Published at",
    updatedAt: "Updated",
    sharePostIntro: "Share this post:",
    sharePostOn: "Share this post on {{platform}}",
    sharePostViaEmail: "Share this post via email",
    tagLabel: "タグ",
    backToTop: "Back to top",
    goBack: "Go back",
    editPage: "Edit page",
    previousPost: "Previous Post",
    nextPost: "Next Post",
  },
  pagination: {
    prev: "Prev",
    next: "Next",
    page: "Page",
  },
  home: {
    socialLinks: "リンク",
    featured: "Featured",
    recentPosts: "最新記事",
    allPosts: "記事一覧",
  },
  footer: {
    copyright: "Copyright",
    allRightsReserved: "All rights reserved.",
  },
  pages: {
    tagTitle: "Tag",
    tagDesc: "All the articles with the tag",

    tagsTitle: "タグ",
    tagsDesc: "記事のタグ一覧です。",

    postsTitle: "記事",
    postsDesc: "公開記事の一覧です。",

    archivesTitle: "Archives",
    archivesDesc: "All the articles I've archived.",

    searchTitle: "検索",
    searchDesc: "記事を検索します。",
  },
  a11y: {
    skipToContent: "本文へ移動",
    openMenu: "メニューを開く",
    closeMenu: "メニューを閉じる",
    toggleTheme: "表示テーマを切り替える",
    searchPlaceholder: "記事を検索...",
    noResults: "該当する記事はありません",
    goToPreviousPage: "Go to previous page",
    goToNextPage: "Go to next page",
  },
  notFound: {
    title: "404 Not Found",
    message: "ページが見つかりません",
    goHome: "ホームへ戻る",
  },
} satisfies UIStrings;
