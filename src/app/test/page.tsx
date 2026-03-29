"use client";

import { useState } from "react";

export default function TestPage() {
  const [count, setCount] = useState(0);

  return (
    <main style={{ padding: 24 }}>
      <h1>スマホ動作テスト</h1>
      <p>カウント: {count}</p>
      <button
        onClick={() => {
          alert("押されました");
          setCount((prev) => prev + 1);
        }}
        style={{
          padding: "12px 16px",
          fontSize: 16,
        }}
      >
        押す
      </button>
    </main>
  );
}