# Queue App (配信参加キュー管理)

配信者向けの参加キュー管理アプリです。  
`/viewer`（視聴者参加）、`/host`（配信者管理）、`/overlay`（OBS表示）を提供します。

## 収益化機能（Priority Ticket）

- host 画面で「優先参加チケット」を発行可能
- 視聴者は viewer 画面で優先コードを入力して参加可能
- 優先コード利用者は待機列で `PRIORITY` として優先表示
- コードごとに価格（円）・利用回数・有効/停止を管理
- 直近販売ログと売上見込み（簡易）を host 画面で確認可能
- 決済確認後に「購入者コード発行」で案内文を自動コピー可能（手動運用を高速化）

これにより、以下のようなマネタイズ導線を実装できます。

- メンバーシップ特典（優先参加コード配布）
- 投げ銭特典（一定額以上で優先コード配布）
- スポンサー枠（企業・コラボ向け専用コード）

## 初回セットアップ（初心者向け）

### 1) あなたが手を動かすところ

1. Firebase プロジェクトを作成  
2. Firestore Database を有効化  
3. Authentication の Google ログインを有効化  
4. Webアプリを追加して Firebase Config を取得  
5. このリポジトリ直下に `.env.local` を作成して、以下を設定

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=xxxx.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=xxxx
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=xxxx.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef
NEXT_PUBLIC_HOST_UID=配信者のGoogleログインUID
```

> `NEXT_PUBLIC_HOST_UID` は、最初に host へログインした際の UID を確認して設定すると確実です。
> このリポジトリでは `queue-app-7cd3a` と `Ns5kRjvsbfZQnNoSUTiQ68L3DNV2` をデフォルト値として同梱しています。`cp .env.example .env.local` で開始できます。
> 値は `"..."` のようにダブルクォート付きでも動作するように実装済みです（内部で自動整形）。

6. 依存関係をインストールして起動

```bash
npm install
npm run dev
```

7. 画面確認
   - `/` : URL共有トップ
   - `/viewer` : 視聴者参加
   - `/host` : 配信者管理
   - `/overlay` : OBS表示

### 2) Firestore の最低コレクション

- `queue`
- `status/activePlayers`
- `config/queueSettings`
- `playerStats`
- `priorityCodes`（優先チケット機能）
- `priorityCodeRedemptions`（販売ログ）

## 収益化を伸ばす実運用アイデア

1. チケット単価を段階化（500円 / 1000円 / 3000円）  
2. 価格ごとに `remainingUses` を変える（高価格ほど複数回）  
3. 週1でコードを無効化し、使い切り運用にする  
4. `priorityCodes` の `redeemedCount` を見て、人気価格帯を翌週の販売に反映する  
5. メンバーシップ特典として、月1回の限定コードを配る

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
