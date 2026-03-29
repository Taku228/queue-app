"use client";

import { useEffect, useState } from "react";

export default function HomePage() {
  const [baseUrl, setBaseUrl] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("app_base_url");
    if (saved) {
      setBaseUrl(saved);
    } else {
      setBaseUrl(window.location.origin);
    }
  }, []);

  const viewerUrl = `${baseUrl}/viewer`;
  const hostUrl = `${baseUrl}/host`;
  const overlayUrl = `${baseUrl}/overlay`;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert("コピーしました");
    } catch {
      alert("コピーに失敗しました");
    }
  };

  const updateBaseUrl = (value: string) => {
    setBaseUrl(value);
    localStorage.setItem("app_base_url", value);
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #f0fdf4 0%, #f8fafc 45%, #ffffff 100%)",
        padding: "20px 14px 40px",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {/* タイトル */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: 20,
            padding: 20,
            marginBottom: 16,
            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          }}
        >
          <h1
            style={{
              fontSize: 28,
              fontWeight: "bold",
              marginBottom: 6,
            }}
          >
            参加型キュー管理
          </h1>

          <p style={{ color: "#475569", fontSize: 14 }}>
            視聴者参加型の順番管理ツールです。
          </p>
        </div>

        {/* ベースURL設定 */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: 20,
            padding: 18,
            marginBottom: 16,
            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: 10 }}>
            URL設定
          </div>

          <input
            value={baseUrl}
            onChange={(e) => updateBaseUrl(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #cbd5e1",
              fontSize: 14,
            }}
          />

          <div
            style={{
              marginTop: 10,
              fontSize: 12,
              color: "#64748b",
            }}
          >
            配信で共有するURL（例：localhost / Firebase Hosting / Vercel）
          </div>
        </div>

        {/* viewer */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: 20,
            padding: 18,
            marginBottom: 16,
            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: "bold", marginBottom: 6 }}>
            視聴者用（参加ページ）
          </div>

          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
            視聴者はここから参加します
          </div>

          <div
            style={{
              background: "#f8fafc",
              padding: 12,
              borderRadius: 12,
              marginBottom: 10,
              wordBreak: "break-all",
              fontSize: 13,
            }}
          >
            {viewerUrl}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => copy(viewerUrl)}
              style={buttonBlue}
            >
              コピー
            </button>

            <a href={viewerUrl} target="_blank" style={buttonGray}>
              開く
            </a>
          </div>
        </div>

        {/* overlay */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: 20,
            padding: 18,
            marginBottom: 16,
            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: "bold", marginBottom: 6 }}>
            配信用表示（OBS）
          </div>

          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
            配信画面に重ねる用
          </div>

          <div style={urlBox}>{overlayUrl}</div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => copy(overlayUrl)} style={buttonBlue}>
              コピー
            </button>

            <a href={overlayUrl} target="_blank" style={buttonGray}>
              開く
            </a>
          </div>
        </div>

        {/* host */}
        <div
          style={{
            background: "#fff7ed",
            borderRadius: 20,
            padding: 18,
            marginBottom: 16,
            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
            border: "1px solid #fed7aa",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: "bold", marginBottom: 6 }}>
            配信者用（管理画面）
          </div>

          <div style={{ fontSize: 13, color: "#92400e", marginBottom: 12 }}>
            ※Googleログインが必要です
          </div>

          <div style={urlBox}>{hostUrl}</div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => copy(hostUrl)} style={buttonBlue}>
              コピー
            </button>

            <a href={hostUrl} target="_blank" style={buttonGray}>
              開く
            </a>
          </div>
        </div>

        {/* 使い方 */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: 20,
            padding: 18,
            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: 10 }}>
            使い方
          </div>

          <ol style={{ fontSize: 13, color: "#475569", lineHeight: 1.7 }}>
            <li>視聴者に「参加ページ」を共有</li>
            <li>配信者は管理画面で順番を操作</li>
            <li>OBSに表示URLを設定</li>
          </ol>
        </div>
      </div>
    </main>
  );
}

const buttonBlue = {
  flex: 1,
  padding: "12px",
  borderRadius: 12,
  border: "none",
  backgroundColor: "#2563eb",
  color: "#fff",
  fontWeight: "bold",
  cursor: "pointer",
  textAlign: "center" as const,
};

const buttonGray = {
  flex: 1,
  padding: "12px",
  borderRadius: 12,
  border: "none",
  backgroundColor: "#64748b",
  color: "#fff",
  textAlign: "center" as const,
  textDecoration: "none",
};

const urlBox = {
  background: "#f8fafc",
  padding: 12,
  borderRadius: 12,
  marginBottom: 10,
  wordBreak: "break-all" as const,
  fontSize: 13,
};