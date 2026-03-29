"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "../../lib/firebase";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
} from "firebase/firestore";

type QueueUser = {
  id: string;
  name: string;
  createdAt: number;
};

type CurrentPlayer = {
  name: string;
  playCount: number;
} | null;

export default function OverlayPage() {
  const [queue, setQueue] = useState<QueueUser[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<CurrentPlayer>(null);

  useEffect(() => {
    const q = query(collection(db, "queue"), orderBy("createdAt"));

    const unsubscribeQueue = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docItem) => {
        const raw = docItem.data();

        return {
          id: docItem.id,
          name: raw.name as string,
          createdAt: raw.createdAt as number,
        };
      });

      setQueue(data);
    });

    const currentPlayerRef = doc(db, "status", "currentPlayer");

    const unsubscribeCurrent = onSnapshot(currentPlayerRef, (snapshot) => {
      if (!snapshot.exists()) {
        setCurrentPlayer(null);
        return;
      }

      const raw = snapshot.data();

      setCurrentPlayer({
        name: raw.name as string,
        playCount:
          typeof raw.playCount === "number" ? raw.playCount : 0,
      });
    });

    return () => {
      unsubscribeQueue();
      unsubscribeCurrent();
    };
  }, []);

  const nextPlayers = useMemo(() => {
    return queue.slice(0, 3);
  }, [queue]);

  return (
    <main
      style={{
        width: "100vw",
        minHeight: "100vh",
        backgroundColor: "rgba(0,0,0,0)",
        color: "#ffffff",
        padding: 24,
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          width: 420,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* タイトル */}
        <div
          style={{
            fontSize: 20,
            fontWeight: "bold",
            textAlign: "center",
            marginBottom: 4,
            textShadow: "0 2px 8px rgba(0,0,0,0.6)",
          }}
        >
          🎮 参加型キュー
        </div>

        {/* 今プレイ中 */}
        <div
          style={{
            background: "linear-gradient(135deg, #16a34a, #22c55e)",
            borderRadius: 16,
            padding: 20,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ fontSize: 14, opacity: 0.9 }}>
            今プレイ中
          </div>

          <div
            style={{
              fontSize: 32,
              fontWeight: "bold",
              marginTop: 6,
            }}
          >
            {currentPlayer ? currentPlayer.name : "なし"}
          </div>

          <div
            style={{
              marginTop: 8,
              fontSize: 14,
              opacity: 0.9,
            }}
          >
            対戦数：{currentPlayer ? currentPlayer.playCount : 0}
          </div>
        </div>

        {/* 次の人 */}
        <div
          style={{
            backgroundColor: "rgba(30,41,59,0.9)",
            borderRadius: 16,
            padding: 20,
          }}
        >
          <div style={{ fontSize: 14, opacity: 0.8 }}>
            次の人
          </div>

          <div
            style={{
              fontSize: 26,
              fontWeight: "bold",
              marginTop: 6,
            }}
          >
            {nextPlayers[0] ? nextPlayers[0].name : "待機なし"}
          </div>
        </div>

        {/* 待機リスト */}
        <div
          style={{
            backgroundColor: "rgba(51,65,85,0.9)",
            borderRadius: 16,
            padding: 20,
          }}
        >
          <div style={{ fontSize: 14, opacity: 0.8 }}>
            待機リスト
          </div>

          {nextPlayers.length === 0 ? (
            <div style={{ marginTop: 8 }}>なし</div>
          ) : (
            <ul
              style={{
                marginTop: 8,
                padding: 0,
                listStyle: "none",
              }}
            >
              {nextPlayers.map((user, index) => (
                <li
                  key={user.id}
                  style={{
                    padding: "6px 0",
                    fontSize: 16,
                  }}
                >
                  {index + 1}. {user.name}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 人数 */}
        <div
          style={{
            backgroundColor: "rgba(15,23,42,0.9)",
            borderRadius: 16,
            padding: 20,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 14, opacity: 0.8 }}>
            待機人数
          </div>

          <div
            style={{
              fontSize: 40,
              fontWeight: "bold",
              marginTop: 4,
            }}
          >
            {queue.length}
          </div>
        </div>
      </div>
    </main>
  );
}