# Queue App (配信参加キュー管理)

配信者向けの参加キュー管理アプリです。  
`/viewer`（視聴者参加）、`/host`（配信者管理）、`/overlay`（OBS表示）を提供します。

## 主要機能

- 視聴者が名前を入力して待機列へ参加（`/viewer`）
- 配信者が待機列・プレイ中を管理（`/host`）
- OBS向けの見やすい表示（`/overlay`）
- 同一端末から名前を変えての多重参加を抑止（`participantToken` ベース）

## 無料版 / 有料版 の機能制限

- Free: 同時参加上限 2人
- Pro: 同時参加上限 4人 + OBSカード色変更
- Business: 同時参加上限 8人 + OBSカード色変更

`config/subscription` の `plan`（`free` / `pro` / `business`）で切り替えます。  
host 画面からプラン変更できます。
`config/subscriptionPricing` で Pro / Business の料金を管理できます。

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
- `config/subscription`
- `config/subscriptionPricing`
- `config/overlayTheme`
- `playerStats`

### 3) Firestore Rules（重要）

viewer から参加できない場合、ほぼ Firestore Rules が原因です。  
`firestore.rules.example` をベースに Firebase Console へ反映してください。

- `queue` への `create` を viewer に許可
- `config` / `status` / `playerStats` は host のみ書き込み許可

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
