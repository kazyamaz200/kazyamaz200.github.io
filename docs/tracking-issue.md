# Tracking Issue

進捗の正本は、非公開の開発リポジトリで管理する Tracking Issue #1。公開用リポジトリを新設する際も、原稿と元の履歴・Issue は非公開側に保管する。

## ローカル検証
- Astro 本番ビルドと型チェック成功。生成物は Home / Blog / RDAD / Projects、タグ、検索、RSS、サイトマップを含む。2本の下書きページは生成されない。
- 一時コピーで記事2を公開状態にした実コンポーネント検証: 日本語 Markdown 表示、記事 URL と RSS・サイトマップの一致、Pagefind 検索結果を確認。記事1は引き続き除外。
- ローカル HTTP サーバーとブラウザーで Home、検索、スマートフォン幅のメニュー、ダークモード切替を確認。Mock は未使用。
- GitHub Actions と Pages 本番は未実行。公開内容と記事は人間のレビュー待ち。

## 引き継ぎ時の検証

- 元のリポジトリは private、管理権限あり、Pages API は 404（未設定）。既存の Actions 実行・PR・タグはなく、ブランチは main のみだった。
- 原稿2本をリポジトリ外へコピーし SHA-256 一致を確認。元の全履歴の Git bundle を作成し `git bundle verify` 成功。現在の tree から原稿を除去した。元の非公開履歴にはまだ原稿が残る。
- Node.js 24.22.1 / pnpm 10.11.1 / frozen lockfile で実際の `pnpm build` 成功。Astro 型チェックは56ファイル、エラー・警告・hint 各0。記事0本に伴う空コレクションのビルド時案内は出る。
- 生成 HTML、RSS、sitemap、圧縮済み Pagefind データを含む全生成物に原稿の固有文言・URL がないこと、RSS item が0件、主要ページ・サイトURLが整合することを確認。
- 内部参照の確認で存在しない favicon.ico への宣言を発見し、既存 SVG の宣言へ統一した。
- workflow は actionlint で検証。配信権限なし・artifact upload なしの CI を追加し、Pages 手動配信は main と承認 SHA の一致を条件にした。
- GitHub 上の CI 結果と独立履歴の候補 SHA は Tracking Issue に記録する。Pages 配信・本番 URL は人間の公開承認後に実施する。

## 残課題
- 記事1の個人体験と経緯の事実確認、2本の記事のレビュー。
- リポジトリ公開前に未公開原稿を非公開で保管し、公開する Git 履歴にも原稿が残らないよう整理する。draft はサイトから除外する設定であり、公開リポジトリのアクセス制限ではない。
- 公開対象の全内容を確認し、公開承認後に Pages を設定・デプロイし、本番 URL を検証する。
