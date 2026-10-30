---
title: "RDADに「Day 0 CI」を組み込んでみる"
draft: false
pubDatetime: 2026-10-30T09:32:07+09:00
tags: [RDAD, CI/CD, セキュリティ, AI, GitHub Actions]
description: "RFC駆動型エージェント開発にDay 0 CIを組み込み、機能とともに品質・セキュリティ検証を育てる。Contract Gateから最小限のGitHub Actions、完了判断までの実践案。"
ogImage: "https://kazyamaz200.github.io/og.png"
---

[前の記事](/posts/ai-vulnerabilities-day0-ci/)では、AIが脆弱性の探索にも防御にも利用される時代に、開発初日から小さなCIを用意しよう、と提案した。

考えてみれば、AIコーディングエージェントに「この機能を実装して」と頼むことは多いのに、「この機能が壊れたらすぐ気付ける状態を先に作って」と頼むことは、まだ少ないのではないだろうか。

一方、AIを使って長時間の自律開発を進めていると、統合テストの段階で不具合が次々に見つかり、修正と再テストを繰り返すうちに完了が見えなくなることがある。

この経験をきっかけに考えたのが、[RFC-Driven Agentic Development（RDAD）](https://gist.github.com/kazyamaz200/94595a2045a9562b9c804c17780fede9)だ。

今回はそこへ **Day 0 CI**、つまり「最初の機能実装から継続的に検証できる、最小限のCI」を組み込む方法を考えてみたい。

先に結論を書くと、**CI/CDを最初から完成させたいわけではない。最初から育て始めたい**のである。

## RDADに何を追加するのか

RDADは、RFC（Request for Comments）を起点として、予備設計、実装計画、実装と段階的検証、統合・受入検証を進めるための開発原則だ。

その中心には次の6つがある。

- **Contract First**：コンポーネント間の契約を内部実装より先に確認する。
- **Minimal Sufficient Implementation**：要求を満たす最小十分な実装を選ぶ。
- **Risk-Based Verification**：重要なリスクを優先して検証する。
- **Complexity Budget**：複雑な仕組みを追加する前に必要性を問う。
- **Bounded Iteration**：修正と再テストを無制限に繰り返さない。
- **Evidence-Based Completion**：受入条件と検証結果で完了を判断する。

Day 0 CIは、この7番目の原則にはしないつもりだ。

すでにある **Risk-Based Verificationを早く始め、Evidence-Based Completionのための証拠を開発中から積み上げる実践方法** と位置付けるのが自然だと思う。

開発フローでいえば、変更するのは主に「予備設計」と「実装計画」、そして「最初の実装PR」の3か所だ。

| RDADの段階 | Day 0 CIで決めること |
| --- | --- |
| RFC | 受入条件、守るべきデータ、重大な失敗条件 |
| 予備設計 / Contract Gate | コンポーネント境界、信頼境界、契約の検証方法 |
| 実装計画 | 最初から実行する最小チェックと、機能とともに追加するチェック |
| 最初の実装PR | 実際に動くCIを作り、失敗を検出できることを確認 |
| 機能実装・結合 | 単体・契約・結合・セキュリティ検証を段階的に追加 |
| 完了 | 必須チェックの実行結果と残存リスクを提示 |

ここでのDay 0は、厳密なカレンダー上の「初日」ではない。**機能の実装が本格化する前に、継続的な検証経路を確保する**という意味だ。

## 最初に決めるのは、テストの数ではなく「何が壊れると困るか」

予備設計では、従来どおりContract Gateを重視したい。

例えば、API・Worker・Databaseが協調して動く非同期処理を考える。これは説明用の仮想的な構成だ。

APIが処理要求を受け取り、Workerが処理し、Databaseに結果を保存する。各コンポーネントの単体テストが通っても、システム全体が正しく動くとは限らない。

- APIは受付成功をどの時点で返すのか。
- Workerが同じメッセージを二度受け取った場合、二重実行してよいのか。
- Databaseの保存だけが失敗した場合、誰が再試行するのか。
- 認証された利用者は、他人の処理結果を参照できないことをどう検証するのか。

これらを先に決めることで、CIに追加する検証も決めやすくなる。

例えば、二重実行を許さないなら冪等性のテストが必要だ。他人の結果を参照させてはいけないなら、認可の失敗ケースを検証する。逆に、まだ存在しない将来機能のために、巨大なFixtureや網羅的なテストマトリクスを作る必要はない。

**契約の重要度を先に判断し、それを検証する最小の仕組みを後から選ぶ。**

セキュリティも同様だ。機械的にスキャナーを追加する前に、どの信頼境界を越える入力や権限が危険なのかを確認しておきたい。

## Day 0では、ビルドが壊れることを確実に検出する

最初のCIは拍子抜けするくらい小さくていい。

例えば、Node.jsとpnpmで開発するプロジェクトなら、GitHub Actionsで依存関係を固定してインストールし、ビルドを実行するところから始められる。

```yaml
# .github/workflows/ci.yml
name: Day 0 CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: "24"
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
```

これは**pnpm 10系と`build`スクリプトが設定済みのプロジェクト向けの説明用サンプル**だ。`pnpm/action-setup`の`version`入力を省略しているため、`package.json`の`packageManager`（例：`pnpm@10.11.1`）または`devEngines.packageManager`でpnpmのバージョンを指定し、`pnpm-lock.yaml`もリポジトリに含めておく。

pnpm 11以降を使う場合は、公式資料で案内されている後継の[`pnpm/setup`](https://github.com/pnpm/setup)を確認したい。アクションのバージョンやNode.jsのバージョンは、実際のリポジトリで互換性を確認して選ぶ。実運用では、ワークフロー依存関係のロックファイル、または検証済みの完全なコミットSHAによる固定を検討したい。

もちろん、プロジェクトによってはLintや最小の単体テストを最初から実行できる。それなら追加すればいい。

ただし、存在しないテストを無理に用意したり、`--if-present`のような指定で「チェックを実行していなくても成功」にしたりするのは避けたい。**CIが緑になった理由を説明できること**の方が大切だ。

私自身の技術ブログ *Boundary Notes* でも、AstroPaperをベースに、公開リポジトリのGitHub Actionsで依存関係のインストールとビルドを実行する構成を置いている。このワークフローは小さいが、変更によってビルドできなくなる問題を早い段階で検出するための出発点になる。

なお、この構成だけで十分なセキュリティ対策や全機能の動作が確認できるわけではない。ここから必要なものを足していく。

## CIは「完成品」ではなく、機能とともに育てるもの

最初のCIを作ったら、次は機能と検証を一緒に増やす。

| 開発の進み方 | 追加を検討する検証 |
| --- | --- |
| 基本ロジックを追加 | 主要な正常系と重要な境界値のUnit Test |
| コンポーネントを接続 | API・イベント・スキーマなどのContract Test |
| 非同期処理や状態管理を追加 | 再試行、重複処理、部分失敗の結合テスト |
| 外部公開APIを追加 | 認証・認可、入力検証、重要な異常系 |
| 依存関係を追加・更新 | 既知の脆弱性やライセンスの確認 |
| リリース可能になった | 承認付きデプロイとリリース後のスモークテスト |

特にContract TestとIntegration Testは、最後にまとめて追加するのではなく、重要な接続点ができたタイミングで実行する。

これなら最終統合テストは、初めて全体を動かす場ではなく、**途中までに確認してきた契約が、全体としても成立することを確認する場**に近づく。

一方で、すべての組み合わせを先回りしてFixtureで再現しようとすると、テスト基盤そのものが複雑になってしまう。RDADでいうComplexity Budgetは、CIにも適用したい。

## Security Gateはどう組み込むか

機能テストだけでは、既知の脆弱なライブラリや危険なコードパターンを見逃すことがある。

そこで、プロジェクトの構成とリスクに応じてSecurity Gateを追加する。

例えばGitHubには、依存関係の脆弱性を通知する**Dependabot alerts**、PRで導入・更新される依存関係を確認する**Dependency Review**、コードの問題を探す**CodeQL code scanning**などがある。

ただし、役割はそれぞれ異なる。Dependency Reviewは新たな依存関係の変更を見るもの、Dependabot alertsは既存の依存関係も含めた既知の問題を通知するものだ。また、CodeQLで検出できる問題にも対象言語やクエリによる限界がある。

全部を初日から必須にする必要はない。まず依存関係の可視化とアラートを整え、公開APIや機密データを扱う機能ができたら、該当するセキュリティ検証を優先して強化する、といった進め方が現実的だと思う。

ここで、**脆弱性が1件見つかったら、どんな内容でも永久にマージ禁止**というルールにはしたくない。

実際に悪用されているか、対象バージョンか、信頼できない入力から到達し得るか、被害が起きたときの影響はどうか。こうした事情を確認し、重大な問題はブロックし、それ以外は根拠を残して修正期限や対応を決める必要がある。

自動化するのは発見と一次検証。リスクの受容や例外の承認まで、AIに無制限に委ねるわけではない。

## CI/CD自体の安全性も設計する

セキュリティを検査するワークフローが、逆に攻撃の入り口になっては困る。

GitHub Actionsのワークフローには、最初から次のような境界を設けたい。

- `GITHUB_TOKEN`は原則読み取り専用とし、必要なジョブにだけ追加権限を与える。
- PRの検証と、本番環境へ配信する処理を分離する。
- 信頼できないPRコードを、Secretsや書き込み権限を持つ特権ワークフローで実行しない。
- 外部Actionや依存関係の出所・バージョンを確認する。
- 本番デプロイには必要に応じて人間の承認を設ける。

特に、`pull_request_target`などの特権的なイベントと、信頼できないPRコードの実行を不用意に組み合わせないことは重要だ。

また、CIとCDは区別したい。Day 0から必要なのは、まず変更を検証できることだ。初日から本番環境への自動デプロイまで用意しなくてもよい。

## 「緑のチェック」の意味を固定する

せっかくCIを作っても、緑色のチェックが何を保証しているのかわからなければ、完了判断に使えない。

例えば、最初のCIでは「依存関係のインストールとビルドが成功した」としか言えない。その後、Contract Testが追加されて初めて「この境界の振る舞いを確認できた」と言える。

RDADのEvidence-Based Completionでは、この違いを明確にしたい。

Tracking Issueの完了報告には、受入条件ごとに「どのテストで確認したか」「Mockか実コンポーネントか」「未実施ならなぜか」を残す。CIが実行できない、あるいは重大な欠陥が残るなら、その事実を明示してBlockedにする。

CI/CDは品質や安全性の証明書ではなく、**何を確認でき、何をまだ確認していないかを継続的に残す仕組み**だと考えている。

## 修正ループもCIで観測できるようにする

Day 0 CIを入れれば、必ず手戻りが減ると証明されたわけではない。

ただ、検証の履歴が残れば、何が起きているかを観測しやすくなる。

例えば、今後の開発で次のような指標を記録してみたい。

- 最初のCIが動くまでの作業量
- PRごとのチェック失敗回数と原因
- 統合段階で見つかった契約・設計起因の不具合数
- 同じ不具合を修正した回数
- 受入条件を満たすまでに要した時間とエージェントのトークン消費量

同じ不具合への修正が2回改善につながらない場合は原因分析に切り替える、統合テストの修正サイクルが3回に達したら設計前提を再確認する――このRDADのBounded Iterationも、CIの結果を使って判断しやすくなるだろう。

重要なのは、**CIを早く作ったかどうかではなく、最後まで作業を収束させやすくなったかどうか**だ。

## RDAD.mdには何を書き加えるべきか

現時点のRDADはv0.1 Draftだ。Day 0 CIを正式に組み込むとしたら、私は新しい基本原則を増やすのではなく、既存の開発フローに以下のような実践規則を加えたい。

> **Day 0 CI / Continuous Verification from the First Implementation**
>
> 実装計画では、最初の機能実装から実行可能な最小限のCIを定義する。ビルド・基本チェック・依存関係や秘密情報の対策をリスクに応じて選択し、開発の進行とともにContract Test、Integration Test、Security Gateを段階的に追加する。CI/CD自体にも最小権限と信頼境界を適用し、実行した検証の範囲と未確認事項を完了報告に残す。

この程度で十分だと思う。

RDADのために巨大なCIフレームワークを作るのは、RDADらしくない。

## おわりに

AIがソフトウェアを作る速度を上げたのなら、検証する仕組みを作る速度も上げられるはずだ。

すべてのテストやスキャナーを最初から導入する必要はない。最初のPRからビルドが動く。次に重要な契約を確認できる。機能が増えるとともにセキュリティ上の確認も増える。そして、完了時に何が検証済みなのかを説明できる。

そういう開発を、エージェントと一緒に進めてみたい。

**CI/CDは、開発の最後に付け足す品質保証ではない。機能と一緒に育つ、開発の一部だ。**

そして、この考え方もRDADの合言葉に収束する。

> **Think at boundaries. Build simply. Verify by risk. Finish predictably.**
>
> 境界は深く考え、実装はシンプルに、検証はリスクに応じて、確実に完成させる。

---

### 参考資料

- [RDAD.md v0.1 Draft](https://gist.github.com/kazyamaz200/94595a2045a9562b9c804c17780fede9)
- [Boundary Notes：AIが脆弱性を「みんなの問題」にする時代、CI/CDは初日から作ろう](/posts/ai-vulnerabilities-day0-ci/)
- [GitHub Docs：Secure use reference for GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use)
- [GitHub Docs：Dependency review](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependency-review)
- [GitHub Docs：Dependabot alerts](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-alerts)
- [GitHub Docs：Code scanningの既定セットアップ](https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/configure-code-scanning/configure-code-scanning)
- [GitHub Docs：About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [pnpm/action-setup：バージョン指定とpnpm/setupへの移行](https://github.com/pnpm/action-setup/blob/v6/README.md)

*執筆基準日：2026年10月30日。GitHubの機能・設定・提供条件は変更されるため、導入時には最新の公式ドキュメントを確認してください。*
