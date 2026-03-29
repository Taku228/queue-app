"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "../../lib/firebase";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  doc,
  getDoc,
} from "firebase/firestore";

type QueueUser = {
  id: string;
  name: string;
  createdAt: number;
};

type CurrentPlayer = {
  name: string;
  startedAt: number;
} | null;

const getPlayerStatsId = (name: string) =>
  encodeURIComponent(name.trim().toLowerCase());

export default function ViewerPage() {
  const [name, setName] = useState("");
  const [queue, setQueue] = useState<QueueUser[]>([]);
  const [message, setMessage] = useState("");
  const [myName, setMyName] = useState("");
  const [currentPlayer, setCurrentPlayer] = useState<CurrentPlayer>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const savedName = localStorage.getItem("queue_my_name");
    if (savedName) {
      setMyName(savedName);
      setName(savedName);
    }

    const q = query(collection(db, "queue"), orderBy("createdAt"));

    const unsubscribeQueue = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docItem) => {
        const raw = docItem.data();

        return {
          id: typeof docItem.id === "string" ? docItem.id : "",
          name: typeof raw.name === "string" ? raw.name : "",
          createdAt: typeof raw.createdAt === "number" ? raw.createdAt : 0,
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
        name: typeof raw.name === "string" ? raw.name : "",
        startedAt: typeof raw.startedAt === "number" ? raw.startedAt : 0,
      });
    });

    return () => {
      unsubscribeQueue();
      unsubscribeCurrent();
    };
  }, []);

  const myPosition = useMemo(() => {
    if (!myName) return -1;

    return queue.findIndex(
      (user) => user.name.trim().toLowerCase() === myName.trim().toLowerCase()
    );
  }, [queue, myName]);

  const nextUpName = useMemo(() => {
    if (queue.length === 0) return "";
    return queue[0].name;
  }, [queue]);

  const joinQueue = async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setMessage("名前を入力してください。");
      return;
    }

    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      const alreadyExists = queue.some(
        (user) => user.name.trim().toLowerCase() === trimmedName.toLowerCase()
      );

      if (alreadyExists) {
        setMessage("その名前はすでに参加しています。");
        setMyName(trimmedName);
        localStorage.setItem("queue_my_name", trimmedName);
        setName(trimmedName);
        return;
      }

      setMessage("参加確認中...");

      const statsRef = doc(db, "playerStats", getPlayerStatsId(trimmedName));
      const statsSnap = await getDoc(statsRef);

      let totalBattles = 0;

      if (statsSnap.exists()) {
        const statsData = statsSnap.data();
        totalBattles =
          typeof statsData.totalBattles === "number"
            ? statsData.totalBattles
            : 0;
      }

      if (totalBattles >= 2) {
        setMessage("この配信では2戦まで参加済みです。");
        return;
      }

      setMessage("参加登録中...");

      await addDoc(collection(db, "queue"), {
        name: trimmedName,
        createdAt: Date.now(),
      });

      setMyName(trimmedName);
      localStorage.setItem("queue_my_name", trimmedName);
      setName(trimmedName);
      setMessage("参加しました。");
    } catch (error) {
      console.error(error);

      if (error instanceof Error) {
        setMessage(`エラー: ${error.message}`);
      } else {
        setMessage("参加処理でエラーが発生しました。");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const clearMyName = () => {
    setMyName("");
    setName("");
    localStorage.removeItem("queue_my_name");
    setMessage("");
  };

  const myStatusText = useMemo(() => {
    if (!myName) return "";

    if (myPosition >= 0) {
      if (myPosition === 0) {
        return "次の順番です";
      }
      return `あと ${myPosition} 人で順番です`;
    }

    return "現在、あなたの名前は待機列にありません。";
  }, [myName, myPosition]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #eff6ff 0%, #f8fafc 45%, #ffffff 100%)",
        padding: "16px 12px 32px",
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 20,
            padding: 18,
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.08)",
            marginBottom: 14,
          }}
        >
          <h1
            style={{
              fontSize: 28,
              fontWeight: "bold",
              marginBottom: 6,
              lineHeight: 1.2,
            }}
          >
            参加画面
          </h1>

          <p
            style={{
              color: "#475569",
              margin: 0,
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            名前を入力して参加できます。順番が来るまでこの画面を開いたままにしてください。
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              backgroundColor: "#dcfce7",
              color: "#166534",
              borderRadius: 16,
              padding: 16,
            }}
          >
            <div
              style={{
                fontSize: 13,
                marginBottom: 4,
                opacity: 0.9,
              }}
            >
              今プレイ中
            </div>
            <div
              style={{
                fontSize: 24,
                fontWeight: "bold",
                lineHeight: 1.2,
              }}
            >
              {currentPlayer ? currentPlayer.name : "なし"}
            </div>
          </div>

          <div
            style={{
              backgroundColor: "#e0f2fe",
              color: "#0c4a6e",
              borderRadius: 16,
              padding: 16,
            }}
          >
            <div
              style={{
                fontSize: 13,
                marginBottom: 4,
                opacity: 0.9,
              }}
            >
              次の人
            </div>
            <div
              style={{
                fontSize: 24,
                fontWeight: "bold",
                lineHeight: 1.2,
              }}
            >
              {nextUpName || "待機なし"}
            </div>
          </div>
        </div>

        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 20,
            padding: 18,
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.08)",
            marginBottom: 14,
          }}
        >
          <div
            style={{
              fontSize: 14,
              color: "#64748b",
              marginBottom: 10,
            }}
          >
            現在の待機人数：{queue.length}人
          </div>

          <div
            style={{
              display: "grid",
              gap: 10,
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="名前を入力"
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: 14,
                border: "1px solid #cbd5e1",
                fontSize: 16,
                boxSizing: "border-box",
              }}
            />

            <button
              onClick={joinQueue}
              disabled={isSubmitting}
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: 14,
                border: "none",
                backgroundColor: isSubmitting ? "#93c5fd" : "#2563eb",
                color: "#fff",
                fontSize: 17,
                fontWeight: "bold",
                cursor: isSubmitting ? "default" : "pointer",
              }}
            >
              {isSubmitting ? "処理中..." : "参加する"}
            </button>

            <button
              onClick={clearMyName}
              disabled={isSubmitting}
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: 14,
                border: "none",
                backgroundColor: "#64748b",
                color: "#fff",
                fontSize: 16,
                cursor: isSubmitting ? "default" : "pointer",
              }}
            >
              名前リセット
            </button>
          </div>

          <div
            style={{
              marginTop: 12,
              fontSize: 12,
              lineHeight: 1.6,
              color: "#64748b",
              backgroundColor: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: "10px 12px",
            }}
          >
            安全運用のため、待機列からの削除は配信者側で行います。
          </div>
        </div>

        {message && (
          <div
            style={{
              marginBottom: 14,
              padding: "14px 16px",
              borderRadius: 16,
              backgroundColor: "#fef3c7",
              color: "#92400e",
              fontSize: 14,
              boxShadow: "0 8px 20px rgba(0, 0, 0, 0.05)",
              wordBreak: "break-word",
            }}
          >
            {message}
          </div>
        )}

        {myName && (
          <div
            style={{
              marginBottom: 14,
              padding: "16px 18px",
              borderRadius: 18,
              backgroundColor: myPosition >= 0 ? "#dbeafe" : "#dcfce7",
              color: myPosition >= 0 ? "#1e3a8a" : "#166534",
              boxShadow: "0 8px 20px rgba(0, 0, 0, 0.05)",
            }}
          >
            <div
              style={{
                fontSize: 13,
                marginBottom: 6,
                opacity: 0.9,
              }}
            >
              あなたの状況
            </div>

            <div
              style={{
                fontSize: 24,
                fontWeight: "bold",
                lineHeight: 1.2,
                marginBottom: 6,
              }}
            >
              {myPosition >= 0 ? `${myPosition + 1} 番目` : "待機列外"}
            </div>

            <div
              style={{
                fontSize: 15,
              }}
            >
              {myStatusText}
            </div>
          </div>
        )}

        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 20,
            padding: 18,
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.08)",
          }}
        >
          <div
            style={{
              fontSize: 16,
              fontWeight: "bold",
              marginBottom: 12,
            }}
          >
            待機リスト
          </div>

          {queue.length === 0 ? (
            <p
              style={{
                color: "#64748b",
                margin: 0,
              }}
            >
              まだ参加者はいません。
            </p>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 10,
              }}
            >
              {queue.map((user, index) => {
                const isMe =
                  myName.trim().toLowerCase() ===
                  user.name.trim().toLowerCase();

                return (
                  <div
                    key={user.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      borderRadius: 14,
                      backgroundColor: isMe ? "#eff6ff" : "#f8fafc",
                      border: isMe
                        ? "1px solid #93c5fd"
                        : "1px solid #e2e8f0",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: "bold",
                          color: "#0f172a",
                          marginBottom: 2,
                        }}
                      >
                        {index + 1}：{user.name}
                      </div>

                      {isMe && (
                        <div
                          style={{
                            fontSize: 12,
                            color: "#2563eb",
                            fontWeight: "bold",
                          }}
                        >
                          あなた
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}