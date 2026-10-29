# 公開準備と承認

状態: 人間の確認待ち。現行リポジトリは非公開のまま維持する。

## 公開候補の範囲

初回候補は Home、Blog（公開記事なし）、RDAD、Projects、検索、RSS、サイトマップと、それらのソース・依存定義・運用文書。Projects は掲載内容確認後に追加する案内のみ。RDAD の説明は指定の一次資料 v0.1 Draft を基にする。画面上の文言、著者名、GitHub プロフィール、画像、ライセンスを含めて人間が確認する。

記事2本は初回候補に含めない。記事1の個人体験・具体例・時系列は本人確認が必要であり、エージェントが補完しない。記事2も一次資料との照合を含むレビュー完了後に追加する。どちらも公開日を改めて決める。

## 原稿と履歴の境界（Contract Gate）

- 原稿の正本と元の履歴は非公開領域で管理する。退避時はコピーの SHA-256 と復元可能な Git bundle を確認する。
- 公開候補にはレビュー対象の追跡ファイルだけを新規コピーし、元の `.git`、原稿、バックアップ、依存物、生成物をコピーしない。新しい root commit を作り、元の親コミットを持たせない。
- 公開判断の対象は候補の commit SHA と tree SHA。変更があれば再確認する。原稿が現在の tree にないだけでは履歴除去完了としない。
- CI は実際の Astro 型チェック・ビルド・Pagefind を実行するが、Pages 権限、サイト配信、生成物のアップロードを持たない。CI 成功は公開承認を意味しない。
- Pages の手動 workflow は `main` かつ repository variable `PUBLICATION_APPROVED_SHA` と実行コミットが一致するときだけビルドと配信を許可する。この変数は公開承認と履歴の分離を確認してから設定する。
- 失敗時は非公開のまま原因を確認する。原稿の保管・候補の履歴検査・人間の確認のいずれかが未完なら公開しない。

## 移行方法の比較

| 方法 | 評価 |
| --- | --- |
| 現行リポジトリでファイル削除だけ行い公開 | 不可。過去のコミットに原稿が残る。 |
| `git-filter-repo` または orphan branch を現行リポジトリへ force push | ブランチ・タグ以外にも PR 参照やキャッシュ等を考慮する必要がある。今回の第一候補にはしない。 |
| 現行を非公開のまま別名へ移し、履歴を引き継がない新規リポジトリを作成 | 推奨。原稿と Tracking Issue を非公開で保持し、公開リポジトリに元の Git object を送らずに済む。 |

GitHub は履歴の書き換えと force push だけでは、コミットがキャッシュや PR 参照等に残る場合があると説明している。未レビュー原稿に対して Support による削除が受けられるとは仮定しない。[GitHub の履歴削除に関する説明](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)

## 承認後の実行順序

1. 人間が公開候補の画面とソースを確認し、commit SHA を指定して、原稿2本を除いた初回公開とリポジトリ移行を承認する。
2. 変更競合がないこと、退避物の照合、現行リポジトリの private、Pages 未設定を再確認する。元リポジトリの非公開バックアップ名（例 `kazyamaz200-blog-private`）が未使用か確認する。
3. 現行リポジトリを非公開のまま別名へ変更する。Tracking Issue はその非公開リポジトリで継続する。移行失敗時はこの状態で止め、公開しない。
4. `kazyamaz200/kazyamaz200.github.io` を新しく private で作成する。古いリポジトリの fork、import、mirror push は使用しない。承認済みの独立した候補から `main` のみ push する。
5. fresh clone で全 refs と全到達可能 object を確認し、原稿の blob、旧コミット、余分なブランチ・タグ、原稿のファイル・文言がないこと、承認済み tree と一致することを確認する。旧 clone から merge/push しない。
6. 新リポジトリの build-only CI 成功を確認する。既存の Actions artifact / cache / release / 添付・Issue 等に原稿がないことも確認する。承認対象との差分があれば止める。
7. 新リポジトリを public に変更し、承認済みコミットを `PUBLICATION_APPROVED_SHA` に設定する。Settings → Pages → Source を GitHub Actions に設定する。GitHub Free では public リポジトリが必要。[Pages の利用条件](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
8. 承認済み `main` の `Deploy to GitHub Pages` を手動実行する。workflow の build / artifact / deploy はこの段階で初めて本番検証する。
9. `https://kazyamaz200.github.io/` で Home、Blog、RDAD、Projects、検索、RSS、sitemap、内部リンク、モバイルメニュー、ダークモード、原稿 URL の 404 を確認する。初回候補は記事0本なので実記事の検索・RSS item は記事承認後に本番で確認する。
10. 実行した workflow と本番 URL、受入条件ごとの結果を非公開の Tracking Issue に記録する。未実施・失敗項目があれば全体を完了にしない。

リポジトリの rename、visibility の変更、Pages の設定・配信は、上記の承認を得てから行う。ここに手順を記載したことは承認ではない。

## 検証方針

既存のローカル検証は Tracking Issue の証拠として引き継ぐ。今回の変更では、原稿を除いた実ビルド、型チェック、生成 HTML / RSS / sitemap / 検索への非混入、独立履歴の検査、非公開 GitHub Actions の build-only 実行を対象にする。UI は変更しない。本番配信と本番 URL は承認後の未完項目として残す。
