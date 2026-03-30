"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { db, isFirebaseConfigured } from "../../lib/firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
} from "firebase/firestore";

type QueueUser = {
  id: string;
  name: string;
  createdAt: number;
  priorityScore: number;
  entryType: "normal" | "priority";
};

type ActivePlayer = {
  name: string;
  startedAt: number;
  joinedTotalBattles: number;
};

type QueueSettings = {
  maxActivePlayers: number;
  maxBattlesPerPlayer: number;
};

type MessageType = "success" | "error" | "info";

const DEFAULT_SETTINGS: QueueSettings = {
  maxActivePlayers: 2,
  maxBattlesPerPlayer: 2,
};

const getPlayerStatsId = (name: string) =>
  encodeURIComponent(name.trim().toLowerCase());

const normalizeName = (name: string) => name.trim().toLowerCase();

export default function ViewerPage() {
  const [name, setName] = useState("");
  const [queue, setQueue] = useState<QueueUser[]>([]);
  const [activePlayers, setActivePlayers] = useState<ActivePlayer[]>([]);
  const [settings, setSettings] = useState<QueueSettings>(DEFAULT_SETTINGS);
  const [playerStatsMap, setPlayerStatsMap] = useState<Record<string, number>>(
    {}
  );
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("info");
  const [myName, setMyName] = useState("");
  const [supportCode, setSupportCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const setStatusMessage = (text: string, type: MessageType = "info") => {
    setMessage(text);
    setMessageType(type);
  };

  useEffect(() => {
    const savedName = localStorage.getItem("queue_my_name");
    if (savedName) {
      setMyName(savedName);
      setName(savedName);
    }

    const queueQuery = query(
      collection(db, "queue"),
      orderBy("priorityScore", "desc"),
      orderBy("createdAt")
    );

    const unsubscribeQueue = onSnapshot(
      queueQuery,
      (snapshot) => {
        const data = snapshot.docs.map((docItem) => {
          const raw = docItem.data();

          return {
            id: docItem.id,
            name: typeof raw.name === "string" ? raw.name : "",
            createdAt: typeof raw.createdAt === "number" ? raw.createdAt : 0,
            priorityScore:
              typeof raw.priorityScore === "number" ? raw.priorityScore : 0,
            entryType: (raw.entryType === "priority"
              ? "priority"
              : "normal") as "normal" | "priority",
          };
        });

        setQueue(data);
      },
      (error) => {
        console.error("viewer queue onSnapshot error:", error);
        setStatusMessage("待機列の読み込みに失敗しました。", "error");
      }
    );

    const unsubscribeActivePlayers = onSnapshot(
      doc(db, "status", "activePlayers"),
      (snapshot) => {
        if (!snapshot.exists()) {
          setActivePlayers([]);
          return;
        }

        const raw = snapshot.data();
        const playersRaw = Array.isArray(raw.players) ? raw.players : [];

        const players: ActivePlayer[] = playersRaw
          .map((item) => ({
            name: typeof item?.name === "string" ? item.name : "",
            startedAt: typeof item?.startedAt === "number" ? item.startedAt : 0,
            joinedTotalBattles:
              typeof item?.joinedTotalBattles === "number"
                ? item.joinedTotalBattles
                : 0,
          }))
          .filter((item) => item.name.trim() !== "");

        setActivePlayers(players);
      },
      (error) => {
        console.error("viewer activePlayers onSnapshot error:", error);
        setStatusMessage("プレイ中情報の読み込みに失敗しました。", "error");
      }
    );

    const unsubscribeSettings = onSnapshot(
      doc(db, "config", "queueSettings"),
      (snapshot) => {
        if (!snapshot.exists()) {
          setSettings(DEFAULT_SETTINGS);
          return;
        }

        const raw = snapshot.data();

        setSettings({
          maxActivePlayers:
            typeof raw.maxActivePlayers === "number" &&
            raw.maxActivePlayers > 0
              ? raw.maxActivePlayers
              : DEFAULT_SETTINGS.maxActivePlayers,
          maxBattlesPerPlayer:
            typeof raw.maxBattlesPerPlayer === "number" &&
            raw.maxBattlesPerPlayer > 0
              ? raw.maxBattlesPerPlayer
              : DEFAULT_SETTINGS.maxBattlesPerPlayer,
        });
      },
      (error) => {
        console.error("viewer queueSettings onSnapshot error:", error);
        setStatusMessage("設定の読み込みに失敗しました。", "error");
      }
    );

    const unsubscribePlayerStats = onSnapshot(
      collection(db, "playerStats"),
      (snapshot) => {
        const nextMap: Record<string, number> = {};

        snapshot.docs.forEach((docItem) => {
          const raw = docItem.data();
          const playerName = typeof raw.name === "string" ? raw.name : "";
          const totalBattles =
            typeof raw.totalBattles === "number" ? raw.totalBattles : 0;

          if (playerName.trim()) {
            nextMap[normalizeName(playerName)] = totalBattles;
          }
        });

        setPlayerStatsMap(nextMap);
      },
      (error) => {
        console.error("viewer playerStats onSnapshot error:", error);
        setStatusMessage("対戦数の読み込みに失敗しました。", "error");
      }
    );

    return () => {
      unsubscribeQueue();
      unsubscribeActivePlayers();
      unsubscribeSettings();
      unsubscribePlayerStats();
    };
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!message) return;

    const timer = window.setTimeout(() => {
      setMessage("");
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [message]);

  const normalizedMyName = myName.trim().toLowerCase();

  const myPosition = useMemo(() => {
    if (!normalizedMyName) return -1;

    return queue.findIndex(
      (user) => user.name.trim().toLowerCase() === normalizedMyName
    );
  }, [queue, normalizedMyName]);

  const myActivePlayer = useMemo(() => {
    if (!normalizedMyName) return null;

    return (
      activePlayers.find(
        (player) => player.name.trim().toLowerCase() === normalizedMyName
      ) ?? null
    );
  }, [activePlayers, normalizedMyName]);

  const isMyTurnNow = !!myActivePlayer;

  const myTotalBattles = useMemo(() => {
    if (!normalizedMyName) return 0;
    return playerStatsMap[normalizedMyName] ?? 0;
  }, [playerStatsMap, normalizedMyName]);

  const myCurrentSessionBattles = useMemo(() => {
    if (!myActivePlayer) return 0;

    const value = myTotalBattles - myActivePlayer.joinedTotalBattles;
    return value >= 0 ? value : 0;
  }, [myActivePlayer, myTotalBattles]);

  const myNextSessionBattle = myCurrentSessionBattles + 1;
  const myNextTotalBattle = myTotalBattles + 1;

  const isInputLocked = isSubmitting || isMyTurnNow;
  const isJoinButtonDisabled = isSubmitting || isMyTurnNow;
  const isResetDisabled = isSubmitting || isMyTurnNow;

  const joinQueue = async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setStatusMessage("名前を入力してください。", "error");
      return;
    }

    if (isSubmitting || isMyTurnNow) return;

    setIsSubmitting(true);

    try {
      const normalizedTrimmedName = trimmedName.toLowerCase();

      const alreadyInQueue = queue.some(
        (user) => user.name.trim().toLowerCase() === normalizedTrimmedName
      );

      const alreadyActive = activePlayers.some(
        (player) => player.name.trim().toLowerCase() === normalizedTrimmedName
      );

      if (alreadyInQueue || alreadyActive) {
        setMyName(trimmedName);
        localStorage.setItem("queue_my_name", trimmedName);
        setName(trimmedName);

        if (alreadyActive) {
          setStatusMessage("その名前は現在プレイ中です。", "info");
        } else {
          setStatusMessage("その名前はすでに待機列に参加しています。", "info");
        }
        return;
      }

      setStatusMessage("参加確認中...", "info");

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

      if (totalBattles >= settings.maxBattlesPerPlayer) {
        setStatusMessage(
          `この配信では ${settings.maxBattlesPerPlayer} 戦まで参加済みです。`,
          "error"
        );
        return;
      }

      let isPriorityEntry = false;
      let redeemedCode = "";
      let priorityPriceYen = 0;

      if (supportCode.trim()) {
        setStatusMessage("優先コード確認中...", "info");
        const normalizedCode = supportCode.trim().toUpperCase();

        await runTransaction(db, async (transaction) => {
          const codeRef = doc(db, "priorityCodes", normalizedCode);
          const codeSnap = await transaction.get(codeRef);

          if (!codeSnap.exists()) {
            throw new Error("優先コードが見つかりません。");
          }

          const codeData = codeSnap.data();
          const isActive = codeData.isActive !== false;
          const remainingUses =
            typeof codeData.remainingUses === "number"
              ? codeData.remainingUses
              : 0;
          const priceYen =
            typeof codeData.priceYen === "number" ? codeData.priceYen : 0;

          if (!isActive || remainingUses <= 0) {
            throw new Error("優先コードは利用上限に達しています。");
          }

          transaction.update(codeRef, {
            remainingUses: remainingUses - 1,
            redeemedCount:
              typeof codeData.redeemedCount === "number"
                ? codeData.redeemedCount + 1
                : 1,
            updatedAt: Date.now(),
          });

          priorityPriceYen = priceYen;
        });

        isPriorityEntry = true;
        redeemedCode = normalizedCode;
      }

      setStatusMessage("参加登録中...", "info");

      await addDoc(collection(db, "queue"), {
        name: trimmedName,
        createdAt: Date.now(),
        priorityScore: isPriorityEntry ? 1 : 0,
        entryType: isPriorityEntry ? "priority" : "normal",
        redeemedCode,
      });

      if (isPriorityEntry) {
        await addDoc(collection(db, "priorityCodeRedemptions"), {
          code: redeemedCode,
          viewerName: trimmedName,
          priceYen: priorityPriceYen,
          redeemedAt: Date.now(),
        });
      }

      setMyName(trimmedName);
      localStorage.setItem("queue_my_name", trimmedName);
      setName(trimmedName);
      setSupportCode("");
      setStatusMessage(
        isPriorityEntry ? "優先参加で登録しました。" : "参加しました。",
        "success"
      );
    } catch (error) {
      console.error(error);

      if (error instanceof Error) {
        setStatusMessage(`エラー: ${error.message}`, "error");
      } else {
        setStatusMessage("参加処理でエラーが発生しました。", "error");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const clearMyName = () => {
    if (isMyTurnNow) return;

    setMyName("");
    setName("");
    localStorage.removeItem("queue_my_name");
    setMessage("");
    inputRef.current?.focus();
  };

  const myStatusText = useMemo(() => {
    if (!myName) return "";

    if (isMyTurnNow) {
      return "今プレイ中です";
    }

    if (myPosition >= 0) {
      if (myPosition === 0) {
        return "次の順番です";
      }
      return `あと ${myPosition} 人で順番です`;
    }

    return "現在、あなたの名前は待機列にありません。";
  }, [myName, myPosition, isMyTurnNow]);

  const messageStyle =
    messageType === "success"
      ? {
          backgroundColor: "#dcfce7",
          color: "#166534",
        }
      : messageType === "error"
      ? {
          backgroundColor: "#fee2e2",
          color: "#991b1b",
        }
      : {
          backgroundColor: "#fef3c7",
          color: "#92400e",
        };

  if (!isFirebaseConfigured) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background:
            "linear-gradient(180deg, #eff6ff 0%, #f8fafc 45%, #ffffff 100%)",
          padding: 16,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 680,
            background: "#ffffff",
            borderRadius: 20,
            padding: 24,
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.08)",
          }}
        >
          <h1 style={{ fontSize: 26, margin: "0 0 8px 0" }}>
            現在セットアップ中です
          </h1>
          <p style={{ color: "#475569", lineHeight: 1.8, margin: 0 }}>
            配信者が Firebase 設定を完了すると、ここから参加できるようになります。
          </p>
        </div>
      </main>
    );
  }

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
                marginBottom: 8,
                opacity: 0.9,
              }}
            >
              NOW PLAYING ({activePlayers.length}/{settings.maxActivePlayers})
            </div>

            {activePlayers.length === 0 ? (
              <div
                style={{
                  fontSize: 24,
                  fontWeight: "bold",
                  lineHeight: 1.2,
                }}
              >
                待機中
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: 8,
                }}
              >
                {activePlayers.map((player, index) => (
                  <div
                    key={`${player.name}-${index}`}
                    style={{
                      fontSize: 22,
                      fontWeight: "bold",
                      lineHeight: 1.2,
                    }}
                  >
                    {index + 1}. {player.name}
                  </div>
                ))}
              </div>
            )}
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
                marginBottom: 6,
                opacity: 0.9,
              }}
            >
              SETTINGS
            </div>

            <div
              style={{
                fontSize: 15,
                lineHeight: 1.7,
                fontWeight: 600,
              }}
            >
              同時参加人数: {settings.maxActivePlayers}人
              <br />
              現在プレイ中: {activePlayers.length}人
              <br />
              1人あたり最大対戦数: {settings.maxBattlesPerPlayer}戦
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
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void joinQueue();
                }
              }}
              placeholder={isMyTurnNow ? "プレイ中は再参加できません" : "名前を入力"}
              autoComplete="name"
              enterKeyHint="send"
              disabled={isInputLocked}
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: 14,
                border: "1px solid #cbd5e1",
                fontSize: 16,
                boxSizing: "border-box",
                outline: "none",
                backgroundColor: isInputLocked ? "#e2e8f0" : "#ffffff",
                color: isInputLocked ? "#64748b" : "#0f172a",
              }}
            />

            <input
              value={supportCode}
              onChange={(e) => setSupportCode(e.target.value)}
              placeholder="優先コード（任意） 例: VIP-AB12"
              autoCapitalize="characters"
              disabled={isInputLocked}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid #cbd5e1",
                fontSize: 15,
                boxSizing: "border-box",
                backgroundColor: isInputLocked ? "#e2e8f0" : "#ffffff",
                color: isInputLocked ? "#64748b" : "#0f172a",
              }}
            />

            <button
              onClick={() => void joinQueue()}
              disabled={isJoinButtonDisabled}
              style={{
                width: "100%",
                minHeight: 52,
                padding: "14px 16px",
                borderRadius: 14,
                border: "none",
                backgroundColor: isJoinButtonDisabled ? "#93c5fd" : "#2563eb",
                color: "#fff",
                fontSize: 17,
                fontWeight: "bold",
                cursor: isJoinButtonDisabled ? "default" : "pointer",
              }}
            >
              {isSubmitting
                ? "処理中..."
                : isMyTurnNow
                ? "プレイ中です"
                : "参加する"}
            </button>

            <button
              onClick={clearMyName}
              disabled={isResetDisabled}
              style={{
                width: "100%",
                minHeight: 48,
                padding: "14px 16px",
                borderRadius: 14,
                border: "none",
                backgroundColor: isResetDisabled ? "#cbd5e1" : "#64748b",
                color: "#fff",
                fontSize: 16,
                cursor: isResetDisabled ? "default" : "pointer",
              }}
            >
              {isMyTurnNow ? "プレイ中はリセットできません" : "名前リセット"}
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
            優先コードは配信者から購入した方のみ利用できます。
            <br />
            安全運用のため、待機列からの削除は配信者側で行います。
          </div>
        </div>

        {message && (
          <div
            style={{
              marginBottom: 14,
              padding: "14px 16px",
              borderRadius: 16,
              fontSize: 14,
              boxShadow: "0 8px 20px rgba(0, 0, 0, 0.05)",
              wordBreak: "break-word",
              ...messageStyle,
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
              backgroundColor: isMyTurnNow
                ? "#fde68a"
                : myPosition >= 0
                ? "#dbeafe"
                : "#dcfce7",
              color: isMyTurnNow
                ? "#92400e"
                : myPosition >= 0
                ? "#1e3a8a"
                : "#166534",
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
              {isMyTurnNow
                ? "プレイ中"
                : myPosition >= 0
                ? `${myPosition + 1} 番目`
                : "待機列外"}
            </div>

            <div
              style={{
                fontSize: 15,
                marginBottom: isMyTurnNow ? 10 : 0,
              }}
            >
              {myStatusText}
            </div>

            {isMyTurnNow && myActivePlayer && (
              <div
                style={{
                  marginTop: 8,
                  padding: "12px 14px",
                  borderRadius: 12,
                  backgroundColor: "rgba(255,255,255,0.45)",
                  fontSize: 14,
                  lineHeight: 1.8,
                }}
              >
                今回 {myCurrentSessionBattles}戦 / 配信通算 {myTotalBattles}戦
                <br />
                次は {myNextSessionBattle}戦目 (合計 {myNextTotalBattle}戦目)
              </div>
            )}
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
                  normalizedMyName === user.name.trim().toLowerCase();

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
                        {user.entryType === "priority" && (
                          <span
                            style={{
                              marginLeft: 8,
                              fontSize: 11,
                              padding: "3px 8px",
                              borderRadius: 9999,
                              backgroundColor: "#fef3c7",
                              color: "#92400e",
                              fontWeight: "bold",
                            }}
                          >
                            PRIORITY
                          </span>
                        )}
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
