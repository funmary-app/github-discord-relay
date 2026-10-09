# github-discord-relay

組織の GitHub Webhook を受け取り、非公開リポジトリのイベントを除いて、Discord の Webhook に転送する Worker です。組織の Webhook には、リポジトリの公開範囲で絞る設定がないため、間に挟んでいます。

## 動き

1. `X-Hub-Signature-256` を検証する。合わなければ 401
2. 本文の `repository.private` が `true` なら、転送せずに 204 を返す。リポジトリを持たないイベント(組織のメンバーの変更など)は転送する
3. それ以外を、`<DISCORD_WEBHOOK_URL>/github` に、本文とイベントのヘッダーをそのまま転送する

## 設定

秘密は `wrangler secret put` で入れます(リポジトリには入れません)。

- `GITHUB_WEBHOOK_SECRET`: 組織の Webhook に設定する秘密
- `DISCORD_WEBHOOK_URL`: Discord の Webhook の URL(末尾に `/github` は付けない)

組織の Webhook は、URL をこの Worker の URL にし、Secret に `GITHUB_WEBHOOK_SECRET` と同じ値を入れ、Content type を `application/json` にします。

デプロイ先の Cloudflare のアカウントは、設定ファイルに書かず、環境変数 `CLOUDFLARE_ACCOUNT_ID` で渡します。

## コマンド

- `pnpm test`: 単体テスト
- `pnpm typecheck`: 型の検査
- `pnpm deploy`: Cloudflare Workers にデプロイする(`CLOUDFLARE_ACCOUNT_ID` が要る)

## ライセンス

次の 2 つのライセンスのどちらかを選んで使えます(SPDX の式では `BSD-3-Clause OR Apache-2.0`)。Funmary と同じです。

- BSD 3-Clause License ([LICENSE-BSD-3-CLAUSE](LICENSE-BSD-3-CLAUSE))
- Apache License, Version 2.0 ([LICENSE-APACHE-2.0](LICENSE-APACHE-2.0))
