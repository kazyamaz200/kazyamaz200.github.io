# RFC: Boundary Notes

状態: 記事0本で初回公開済み。正式名称は Boundary Notes。

## 目的と読者
Engineering at the Boundaries.

ソフトウェア、AIエージェント、インフラ、技術探索の実践と試行錯誤を記録する個人技術ブログ。RDAD は Boundary Notes の主要な技術テーマの一つであり、ブログ全体の名称ではない。

URL は https://kazyamaz200.github.io/、テーマは AstroPaper。サイト設定を正本とし、ナビゲーション・ページタイトル・メタデータ・OGP・RSS に名称と説明を共用する。タグラインはホームと標準の OG 画像に表示し、AstroPaper のミニマルな構成を維持する。

## 範囲
Home、記事一覧・タグ・検索、RDAD、Projects、RSS、サイトマップを静的に提供する。Markdown / MDX を記事の正本とし、AstroPaper 標準のテーマ、検索、ダークモード、レスポンシブ表示を使う。記事はレビュー後に公開する。

## 非対象
CMS、DB、認証、コメント、解析、複雑な多言語対応、独自検索・UIライブラリ、有料サービス。

## 受入条件
- 指定の4ページ、記事一覧・タグ・検索が利用でき、日本語 Markdown / MDX を描画できる。
- 下書きは本番ページ、検索、RSS、サイトマップから除外される。
- 本番ビルドが成功し、内部リンクと記事URL・RSS・サイトマップが整合する。
- 最小権限の公式 Astro Action / GitHub Pages ワークフローを備える。
- README に記事の作成・レビュー・公開手順を記載する。
- Tracking Issue に成果物、検証結果、残課題を記録する。公開前に人間が内容を確認する。

## 運用
記事は `draft: true` で作成し、事実確認とレビュー後に公開日時を確認して `false` に変更する。GitHub Actions から Pages に配信する。未確認の体験・経歴は掲載しない。RDAD の一次資料は指定された Gist。公開後は本番URLを検証する。
