# Boundary Notes

Engineering at the Boundaries.

ソフトウェア、AIエージェント、インフラ、技術探索の実践と試行錯誤を記録する個人技術ブログ。

URL: https://kazyamaz200.github.io/ — Theme: AstroPaper。RDAD はブログで扱う主要な技術テーマの一つです。

AstroPaper v6.0.0 を基にした Astro の静的ブログです。設計と受入条件は [RFC](docs/rfc.md)、[予備設計](docs/design.md)、[実装計画](docs/plan.md) を参照してください。RDAD の一次資料は [RDAD.md](https://gist.github.com/kazyamaz200/94595a2045a9562b9c804c17780fede9) です。

## ローカルで実行

Node.js 22.12 以上と pnpm を使用します。

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm build
pnpm preview
```

検索インデックスは `pnpm build` で生成されます。検索は本番ビルド後にプレビューで確認します。

## 記事の追加・更新

`src/content/posts/` に `.md` または `.mdx` を作成します。例:

```yaml
---
title: "記事のタイトル"
pubDatetime: 2026-10-29T09:00:00+09:00
draft: true
tags: [開発, Astro]
description: "記事の説明"
---
```

この例を使った執筆・レビューは、リポジトリ外の非公開の場所で行います。公開リポジトリでは `draft: true` でもファイルと Git 履歴は誰でも読めます。レビュー済みの原稿だけを、公開日時を確認して `draft: false` で追加してください。テーマは開発時を含め下書きを表示しません。表示レビューには非公開の別コピーを使います。既存記事は本文を更新し、必要に応じて `modDatetime` を指定します。タグをカテゴリとして利用します。

## CI と公開承認

`Validate blog (no deployment)` は push / pull request / 手動実行で、Node.js 24 と固定 pnpm を使い、型チェック・本番ビルド・検索インデックス生成を検証します。Pages への配信や生成物のアップロードは行いません。

初回候補は記事0本です。未レビュー原稿2本はリポジトリ外へ退避済みですが、現行の非公開リポジトリの過去の履歴には残っています。このリポジトリをそのまま public にしてはいけません。人間が確認する対象と履歴を引き継がない移行手順は [公開準備](docs/publication.md) を参照してください。

## GitHub Pages

公開内容の人間による確認と履歴の分離後、承認済み commit SHA を repository variable `PUBLICATION_APPROVED_SHA` に設定し、Settings → Pages → Source を GitHub Actions に設定します。`Deploy to GitHub Pages` を `main` から手動実行します。承認 SHA と実行 SHA が一致しなければ配信されません。公開後、トップ、記事一覧、検索、RSS、サイトマップを本番 URL で確認してください。次の更新も内容のレビュー後に承認 SHA を更新して手動配信します。

AstroPaper は MIT ライセンスです。元の著作権表示は [LICENSE](LICENSE) を参照してください。
