"use client";

import { useEffect, useMemo, useState } from "react";
import { auth, db } from "../../lib/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from "firebase/auth";

type QueueUser = {
  id: string;
  name: string;
  createdAt: number;
};

type CurrentPlayer = {
  name: string;
  startedAt: number;
  playCount: number;
  totalBattles: number;
} | null;

const getPlayerStatsId = (name: string) =>
  encodeURIComponent(name.trim().toLowerCase());

// 最初は空文字のままでOKです。
// まずログインして UID を画面表示で確認してから、ここへ入れてください。
const HOST_UID = "Ns5kRjvsbfZQnNoSUTiQ68L3DNV2";

export default function HostPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [queue, setQueue] = useState<QueueUser[]>([]);
  const [message, setMessage] = useState("");
  const [currentPlayer, setCurrentPlayer] = useState<CurrentPlayer>(null);
  const [isBusy, setIsBusy] = useState(false);

  const isHost = !!user && !!HOST_UID && user.uid === HOST_UID;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setQueue([]);
      setCurrentPlayer(null);
      return;
    }

    const q = query(collection(db, "queue"), orderBy("createdAt"));

    const unsubscribeQueue = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docItem) => {
        const raw = docItem.data();

        return {
          id: docItem.id,
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
        playCount: typeof raw.playCount === "number" ? raw.playCount : 0,
        totalBattles:
          typeof raw.totalBattles === "number" ? raw.totalBattles : 0,
      });
    });

    return () => {
      unsubscribeQueue();
      unsubscribeCurrent();
    };
  }, [user]);

  const waitingCount = queue.length;

  const nextUpName = useMemo(() => {
    if (queue.length === 0) return "待機なし";
    return queue[0].name;
  }, [queue]);

  const signInAsHost = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setMessage("");
    } catch (error: any) {
      console.error("Google sign-in error:", error);

      const code = error?.code ?? "unknown";
      const detail = error?.message ?? "詳細不明";

      setMessage(`Googleログイン失敗: ${code} / ${detail}`);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setMessage("");
    } catch (error: any) {
      console.error("Sign-out error:", error);

      const code = error?.code ?? "unknown";
      const detail = error?.message ?? "詳細不明";

      setMessage(`ログアウト失敗: ${code} / ${detail}`);
    }
  };

  const nextPlayer = async () => {
    if (isBusy) return;

    if (!isHost) {
      setMessage("host権限がありません。");
      return;
    }

    if (currentPlayer) {
      setMessage(
        "今プレイ中の人がいます。先にクリアするか、最後尾に戻してください。"
      );
      return;
    }

    if (queue.length === 0) {
      setMessage("次の人がいません。");
      return;
    }

    setIsBusy(true);
    setMessage("次の人を開始中...");

    try {
      const first = queue[0];
      const startedAt = Date.now();

      const statsRef = doc(db, "playerStats", getPlayerStatsId(first.name));
      const statsSnap = await getDoc(statsRef);

      let totalBattles = 0;
      if (statsSnap.exists()) {
        const statsData = statsSnap.data();
        totalBattles =
          typeof statsData.totalBattles === "number"
            ? statsData.totalBattles
            : 0;
      }

      await setDoc(doc(db, "status", "currentPlayer"), {
        name: first.name,
        startedAt,
        playCount: 0,
        totalBattles,
      });

      await deleteDoc(doc(db, "queue", first.id));

      setMessage(`${first.name} さんを開始しました。`);
    } catch (error: any) {
      console.error("nextPlayer error:", error);

      const code = error?.code ?? "unknown";
      const detail = error?.message ?? "詳細不明";

      setMessage(`次の人への切り替え失敗: ${code} / ${detail}`);
    } finally {
      setIsBusy(false);
    }
  };

  const addBattle = async () => {
    if (isBusy) return;

    if (!isHost) {
      setMessage("host権限がありません。");
      return;
    }

    if (!currentPlayer) {
      setMessage("今プレイ中の人がいません。");
      return;
    }

    setIsBusy(true);
    setMessage("対戦数を更新中...");

    try {
      const nextPlay = currentPlayer.playCount + 1;
      const nextTotal = currentPlayer.totalBattles + 1;

      await setDoc(
        doc(db, "status", "currentPlayer"),
        {
          ...currentPlayer,
          playCount: nextPlay,
          totalBattles: nextTotal,
        },
        { merge: true }
      );

      await setDoc(
        doc(db, "playerStats", getPlayerStatsId(currentPlayer.name)),
        {
          name: currentPlayer.name,
          totalBattles: nextTotal,
        },
        { merge: true }
      );

      if (nextTotal >= 2) {
        setMessage(
          `${currentPlayer.name} さんはこの配信で ${nextTotal} 戦目です。参加上限に達しています。`
        );
      } else {
        setMessage(
          `${currentPlayer.name} さんの対戦数を ${nextPlay} に更新しました。`
        );
      }
    } catch (error: any) {
      console.error("addBattle error:", error);

      const code = error?.code ?? "unknown";
      const detail = error?.message ?? "詳細不明";

      setMessage(`対戦数更新失敗: ${code} / ${detail}`);
    } finally {
      setIsBusy(false);
    }
  };

  const moveCurrentPlayerToQueueEnd = async () => {
    if (isBusy) return;

    if (!isHost) {
      setMessage("host権限がありません。");
      return;
    }

    if (!currentPlayer) {
      setMessage("今プレイ中の人がいません。");
      return;
    }

    const confirmed = window.confirm(
      `${currentPlayer.name} さんを待機列の最後尾へ戻しますか？`
    );
    if (!confirmed) return;

    setIsBusy(true);
    setMessage("待機列の最後に戻しています...");

    try {
      await addDoc(collection(db, "queue"), {
        name: currentPlayer.name,
        createdAt: Date.now(),
      });

      await deleteDoc(doc(db, "status", "currentPlayer"));

      setMessage(`${currentPlayer.name} さんを待機列の最後に戻しました。`);
    } catch (error: any) {
      console.error("moveCurrentPlayerToQueueEnd error:", error);

      const code = error?.code ?? "unknown";
      const detail = error?.message ?? "詳細不明";

      setMessage(`最後尾へ戻す処理失敗: ${code} / ${detail}`);
    } finally {
      setIsBusy(false);
    }
  };

  const clearPlayer = async () => {
    if (isBusy) return;

    if (!isHost) {
      setMessage("host権限がありません。");
      return;
    }

    if (!currentPlayer) {
      setMessage("今プレイ中の人はいません。");
      return;
    }

    const confirmed = window.confirm(
      `${currentPlayer.name} さんを終了してクリアしますか？`
    );
    if (!confirmed) return;

    setIsBusy(true);
    setMessage("今プレイ中をクリアしています...");

    try {
      const name = currentPlayer.name;
      await deleteDoc(doc(db, "status", "currentPlayer"));
      setMessage(`${name} さんをクリアしました。`);
    } catch (error: any) {
      console.error("clearPlayer error:", error);

      const code = error?.code ?? "unknown";
      const detail = error?.message ?? "詳細不明";

      setMessage(`クリア処理失敗: ${code} / ${detail}`);
    } finally {
      setIsBusy(false);
    }
  };

  const removeFromQueue = async (userId: string, userName: string) => {
    if (isBusy) return;

    if (!isHost) {
      setMessage("host権限がありません。");
      return;
    }

    const confirmed = window.confirm(
      `${userName} さんを待機リストから削除しますか？`
    );
    if (!confirmed) return;

    setIsBusy(true);
    setMessage("待機リストから削除中...");

    try {
      await deleteDoc(doc(db, "queue", userId));
      setMessage(`${userName} さんを待機リストから削除しました。`);
    } catch (error: any) {
      console.error("removeFromQueue error:", error);

      const code = error?.code ?? "unknown";
      const detail = error?.message ?? "詳細不明";

      setMessage(`待機リスト削除失敗: ${code} / ${detail}`);
    } finally {
      setIsBusy(false);
    }
  };

  if (authLoading) {
    return (
      <main style={{ padding: 24 }}>
        <p>認証状態を確認中...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={{ minHeight: "100vh", padding: 24, background: "#f8fafc" }}>
        <div
          style={{
            maxWidth: 520,
            margin: "40px auto",
            background: "#fff",
            borderRadius: 20,
            padding: 24,
            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          }}
        >
          <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 12 }}>
            配信者ログイン
          </h1>

          <p style={{ color: "#475569", lineHeight: 1.6, marginBottom: 16 }}>
            host画面は Google ログインが必要です。
          </p>

          <button
            onClick={signInAsHost}
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: 14,
              border: "none",
              backgroundColor: "#2563eb",
              color: "#fff",
              fontSize: 16,
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            Googleでログイン
          </button>

          {message && (
            <div
              style={{
                marginTop: 14,
                padding: "12px 14px",
                borderRadius: 14,
                backgroundColor: "#fef3c7",
                color: "#92400e",
                fontSize: 14,
                wordBreak: "break-word",
              }}
            >
              {message}
            </div>
          )}
        </div>
      </main>
    );
  }

  if (!HOST_UID) {
    return (
      <main style={{ minHeight: "100vh", padding: 24, background: "#f8fafc" }}>
        <div
          style={{
            maxWidth: 700,
            margin: "40px auto",
            background: "#fff",
            borderRadius: 20,
            padding: 24,
            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          }}
        >
          <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 12 }}>
            host UID 未設定
          </h1>

          <p style={{ color: "#475569", lineHeight: 1.6, marginBottom: 16 }}>
            まずこの画面で自分の UID を確認して、
            <code> HOST_UID </code>
            に貼り付けてください。
          </p>

          <div
            style={{
              padding: "14px 16px",
              borderRadius: 14,
              backgroundColor: "#f8fafc",
              border: "1px solid #e2e8f0",
              marginBottom: 12,
              wordBreak: "break-all",
            }}
          >
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 6 }}>
              ログイン中メール
            </div>
            <div style={{ marginBottom: 12 }}>{user.email ?? "なし"}</div>

            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 6 }}>
              UID
            </div>
            <div>{user.uid}</div>
          </div>

          <button
            onClick={logout}
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: 14,
              border: "none",
              backgroundColor: "#64748b",
              color: "#fff",
              fontSize: 16,
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            ログアウト
          </button>
        </div>
      </main>
    );
  }

  if (!isHost) {
    return (
      <main style={{ minHeight: "100vh", padding: 24, background: "#f8fafc" }}>
        <div
          style={{
            maxWidth: 520,
            margin: "40px auto",
            background: "#fff",
            borderRadius: 20,
            padding: 24,
            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          }}
        >
          <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 12 }}>
            権限がありません
          </h1>

          <p style={{ color: "#475569", lineHeight: 1.6, marginBottom: 16 }}>
            このアカウントでは host 画面を利用できません。
          </p>

          <div
            style={{
              marginBottom: 12,
              color: "#334155",
              fontSize: 14,
              wordBreak: "break-all",
            }}
          >
            ログイン中: {user.email ?? user.uid}
          </div>

          <div
            style={{
              marginBottom: 16,
              color: "#64748b",
              fontSize: 13,
              wordBreak: "break-all",
            }}
          >
            UID: {user.uid}
          </div>

          <button
            onClick={logout}
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: 14,
              border: "none",
              backgroundColor: "#64748b",
              color: "#fff",
              fontSize: 16,
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            ログアウト
          </button>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #f0fdf4 0%, #f8fafc 45%, #ffffff 100%)",
        padding: "16px 12px 32px",
      }}
    >
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 20,
            padding: 20,
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
            配信者管理
          </h1>

          <p
            style={{
              color: "#475569",
              margin: 0,
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            順番送り、対戦数加算、待機列管理をここで行います。
          </p>

          <div
            style={{
              marginTop: 12,
              fontSize: 13,
              color: "#64748b",
              wordBreak: "break-all",
            }}
          >
            ログイン中: {user.email ?? user.uid}
          </div>

          <div
            style={{
              marginTop: 6,
              fontSize: 12,
              color: "#94a3b8",
              wordBreak: "break-all",
            }}
          >
            UID: {user.uid}
          </div>

          <button
            onClick={logout}
            style={{
              marginTop: 10,
              padding: "10px 14px",
              borderRadius: 10,
              border: "none",
              backgroundColor: "#64748b",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            ログアウト
          </button>
        </div>

        <div style={{ display: "grid", gap: 12, marginBottom: 14 }}>
          <div
            style={{
              backgroundColor: "#dcfce7",
              color: "#166534",
              borderRadius: 18,
              padding: 18,
              boxShadow: "0 10px 24px rgba(0, 0, 0, 0.05)",
            }}
          >
            <div style={{ fontSize: 13, marginBottom: 4, opacity: 0.9 }}>
              今プレイ中
            </div>

            <div
              style={{
                fontSize: 26,
                fontWeight: "bold",
                lineHeight: 1.2,
                marginBottom: 6,
              }}
            >
              {currentPlayer?.name ?? "なし"}
            </div>

            <div style={{ fontSize: 14, marginBottom: 4 }}>
              この順番での対戦数：{currentPlayer?.playCount ?? 0}
            </div>

            <div style={{ fontSize: 14 }}>
              この配信での累計対戦数：{currentPlayer?.totalBattles ?? 0}
            </div>

            {currentPlayer && currentPlayer.totalBattles >= 2 && (
              <div
                style={{
                  marginTop: 10,
                  backgroundColor: "#fef3c7",
                  color: "#92400e",
                  borderRadius: 12,
                  padding: "10px 12px",
                  fontSize: 13,
                  fontWeight: "bold",
                }}
              >
                この人は参加上限に達しています。
              </div>
            )}
          </div>

          <div
            style={{
              backgroundColor: "#e0f2fe",
              color: "#0c4a6e",
              borderRadius: 18,
              padding: 18,
              boxShadow: "0 10px 24px rgba(0, 0, 0, 0.05)",
            }}
          >
            <div style={{ fontSize: 13, marginBottom: 4, opacity: 0.9 }}>
              次の人
            </div>

            <div
              style={{
                fontSize: 24,
                fontWeight: "bold",
                lineHeight: 1.2,
              }}
            >
              {nextUpName}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: 18,
                padding: 18,
                boxShadow: "0 10px 24px rgba(0, 0, 0, 0.05)",
              }}
            >
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 4 }}>
                待機人数
              </div>
              <div style={{ fontSize: 30, fontWeight: "bold", color: "#0f172a" }}>
                {waitingCount}
              </div>
            </div>

            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: 18,
                padding: 18,
                boxShadow: "0 10px 24px rgba(0, 0, 0, 0.05)",
              }}
            >
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 4 }}>
                処理状態
              </div>
              <div style={{ fontSize: 16, fontWeight: "bold", color: "#0f172a" }}>
                {isBusy ? "処理中..." : "待機中"}
              </div>
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
          <div style={{ fontSize: 18, fontWeight: "bold", marginBottom: 12 }}>
            メイン操作
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <button
              onClick={nextPlayer}
              disabled={isBusy}
              style={{
                width: "100%",
                padding: "16px 18px",
                fontSize: 20,
                fontWeight: "bold",
                backgroundColor: isBusy ? "#93c5fd" : "#2563eb",
                color: "#ffffff",
                border: "none",
                borderRadius: 16,
                cursor: isBusy ? "default" : "pointer",
              }}
            >
              ▶ 次の人
            </button>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 10,
              }}
            >
              <button
                onClick={addBattle}
                disabled={isBusy || !currentPlayer}
                style={{
                  padding: "14px 16px",
                  fontSize: 16,
                  fontWeight: "bold",
                  backgroundColor:
                    isBusy || !currentPlayer ? "#bae6fd" : "#0ea5e9",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 14,
                  cursor: isBusy || !currentPlayer ? "default" : "pointer",
                }}
              >
                +1戦
              </button>

              <button
                onClick={moveCurrentPlayerToQueueEnd}
                disabled={isBusy || !currentPlayer}
                style={{
                  padding: "14px 16px",
                  fontSize: 16,
                  fontWeight: "bold",
                  backgroundColor:
                    isBusy || !currentPlayer ? "#c4b5fd" : "#7c3aed",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 14,
                  cursor: isBusy || !currentPlayer ? "default" : "pointer",
                }}
              >
                最後尾に戻す
              </button>

              <button
                onClick={clearPlayer}
                disabled={isBusy || !currentPlayer}
                style={{
                  padding: "14px 16px",
                  fontSize: 16,
                  fontWeight: "bold",
                  backgroundColor:
                    isBusy || !currentPlayer ? "#cbd5e1" : "#64748b",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 14,
                  cursor: isBusy || !currentPlayer ? "default" : "pointer",
                }}
              >
                終了してクリア
              </button>
            </div>
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

        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 20,
            padding: 18,
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.08)",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: "bold", marginBottom: 12 }}>
            待機リスト
          </div>

          {queue.length === 0 ? (
            <p style={{ color: "#64748b", margin: 0 }}>
              待機中の参加者はいません。
            </p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {queue.map((user, index) => (
                <div
                  key={user.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 14px",
                    borderRadius: 14,
                    backgroundColor: index === 0 ? "#eff6ff" : "#f8fafc",
                    border:
                      index === 0
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
                      {index + 1}位：{user.name}
                    </div>

                    {index === 0 && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "#2563eb",
                          fontWeight: "bold",
                        }}
                      >
                        次に呼ばれます
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => removeFromQueue(user.id, user.name)}
                    disabled={isBusy}
                    style={{
                      backgroundColor: isBusy ? "#fca5a5" : "#dc2626",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: 10,
                      padding: "10px 12px",
                      fontSize: 14,
                      fontWeight: "bold",
                      cursor: isBusy ? "default" : "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    削除
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}