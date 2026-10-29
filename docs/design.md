# 予備設計・Contract Gate

- Markdown / MDX → Astro content collections: frontmatter をテーマのスキーマで検証。`draft: true` は `postFilter` でページ生成・一覧・RSS・タグから除外。Pagefind は生成 HTML を索引化する。
- Astro → Actions: ロックファイルで依存を固定し、公式 `withastro/action` がビルドして Pages artifact をアップロード。失敗時はデプロイしない。
- CI → 検証: build-only workflow が Node.js 24、固定 pnpm、frozen lockfile で型チェック・ビルド・Pagefind を実行する。権限は contents read のみ。artifact はアップロードしない。
- Actions → Pages: `deploy-pages` が artifact を配信。Pages Source は GitHub Actions。手動開始かつ `main` の実行 SHA が `PUBLICATION_APPROVED_SHA` と一致することを前提とする。ビルドは contents read、配信ジョブのみ pages write と id-token write を持つ。
- URL: `site` を `https://kazyamaz200.github.io` にし、ユーザーサイトなので base は省略。テーマの URL 関数を RSS と記事に共用し、sitemap と生成ファイルで照合する。
- 検証: 実際の本番ビルド、生成物、ローカル配信でページとリンク、RSS、検索索引、下書き除外を確認。Pages 上の配信は公開承認後に確認。
- 失敗と復旧: ビルド失敗はログを確認し配信を中止。Pages 設定・権限の失敗は GitHub 側で確認し、再実行。実際の Pages 統合は公開後まで未検証。
- 不要な独自検索、契約テスト基盤、拡張機構は導入しない。タグをカテゴリとして扱う。

上記の責務、入出力、失敗時の扱いと受入シナリオを定め、Contract Gate を通過。GitHub リポジトリの private と管理権限、Pages 未設定を確認済み。原稿保管・候補の独立履歴・公開承認の追加契約は [公開準備](publication.md) を参照する。
