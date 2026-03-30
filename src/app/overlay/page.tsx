"use client";

import { useEffect, useMemo, useState } from "react";
import { db, firebaseClientInitError, isFirebaseConfigured } from "../../lib/firebase";
import { ENABLE_PRIORITY_FEATURES } from "../../lib/features";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
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

const normalizeName = (name: string) => name.trim().toLowerCase();

export default function OverlayPage() {
  const [queue, setQueue] = useState<QueueUser[]>([]);
  const [activePlayers, setActivePlayers] = useState<ActivePlayer[]>([]);
  const [playerStatsMap, setPlayerStatsMap] = useState<Record<string, number>>(
    {}
  );

  useEffect(() => {
    if (!isFirebaseConfigured || firebaseClientInitError) {
      return;
    }

    const queueQuery = query(
      collection(db, "queue"),
      orderBy("createdAt")
    );

    const unsubscribeQueue = onSnapshot(
      queueQuery,
      (snapshot) => {
        const data = snapshot.docs
          .map((docItem) => {
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
          })
          .sort((a, b) => {
            if (b.priorityScore !== a.priorityScore) {
              return b.priorityScore - a.priorityScore;
            }
            return a.createdAt - b.createdAt;
          });

        setQueue(data);
      },
      (error) => {
        console.error("overlay queue onSnapshot error:", error);
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
        console.error("overlay activePlayers onSnapshot error:", error);
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
        console.error("overlay playerStats onSnapshot error:", error);
      }
    );

    return () => {
      unsubscribeQueue();
      unsubscribeActivePlayers();
      unsubscribePlayerStats();
    };
  }, []);

  const nextPlayerName = useMemo(() => {
    if (queue.length === 0) return "待機なし";
    return queue[0].name || "待機なし";
  }, [queue]);
  const nextPlayerIsPriority =
    ENABLE_PRIORITY_FEATURES && queue[0]?.entryType === "priority";

  const waitingCount = queue.length;

  const waitingListAfterNext = useMemo(() => {
    return queue.slice(1, 4);
  }, [queue]);

  const activePlayersWithBattles = useMemo(() => {
    return activePlayers.map((player) => {
      const totalBattles = playerStatsMap[normalizeName(player.name)] ?? 0;
      const currentSessionBattles = Math.max(
        totalBattles - player.joinedTotalBattles,
        0
      );

      return {
        ...player,
        totalBattles,
        currentSessionBattles,
      };
    });
  }, [activePlayers, playerStatsMap]);

  if (!isFirebaseConfigured || !!firebaseClientInitError) {
    return (
      <main
        style={{
          width: "100vw",
          height: "100vh",
          display: "grid",
          placeItems: "center",
          color: "#fff",
          background: "rgba(15, 23, 42, 0.82)",
          fontSize: 24,
          fontWeight: 700,
        }}
      >
        Firebase設定待ち
        {firebaseClientInitError ? ` / ${firebaseClientInitError}` : ""}
      </main>
    );
  }

  return (
    <main
      style={{
        width: "100vw",
        height: "100vh",
        background: "transparent",
        overflow: "hidden",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "flex-start",
          padding: "28px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "grid",
            gap: 16,
            minWidth: 620,
            maxWidth: 980,
          }}
        >
          <div
            style={{
              borderRadius: 24,
              padding: "22px 26px",
              background: "rgba(15, 23, 42, 0.68)",
              border: "1px solid rgba(255,255,255,0.14)",
              boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
            }}
          >
            <div
              style={{
                fontSize: 22,
                fontWeight: 800,
                color: "rgba(255,255,255,0.82)",
                marginBottom: 8,
                letterSpacing: "0.04em",
                textShadow: "0 2px 10px rgba(0,0,0,0.9)",
              }}
            >
              NOW PLAYING
            </div>

            {activePlayersWithBattles.length === 0 ? (
              <div
                style={{
                  fontSize: 54,
                  fontWeight: 900,
                  lineHeight: 1.08,
                  color: "#ffffff",
                  textShadow:
                    "0 4px 18px rgba(0,0,0,0.95), 0 0 10px rgba(0,0,0,0.7)",
                }}
              >
                待機中
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: 12,
                }}
              >
                {activePlayersWithBattles.map((player, index) => (
                  <div
                    key={`${player.name}-${index}`}
                    style={{
                      padding: "10px 0",
                      borderBottom:
                        index === activePlayersWithBattles.length - 1
                          ? "none"
                          : "1px solid rgba(255,255,255,0.12)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 48,
                        fontWeight: 900,
                        lineHeight: 1.08,
                        color: "#ffffff",
                        wordBreak: "break-word",
                        textShadow:
                          "0 4px 18px rgba(0,0,0,0.95), 0 0 10px rgba(0,0,0,0.7)",
                      }}
                    >
                      {player.name}
                    </div>

                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 18,
                        fontWeight: 700,
                        color: "rgba(255,255,255,0.88)",
                        lineHeight: 1.5,
                        textShadow:
                          "0 2px 10px rgba(0,0,0,0.92), 0 0 6px rgba(0,0,0,0.65)",
                      }}
                    >
                      {player.currentSessionBattles}戦 / 合計 {player.totalBattles}戦
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 0.8fr",
              gap: 16,
            }}
          >
            <div
              style={{
                display: "grid",
                gap: 16,
              }}
            >
              <div
                style={{
                  borderRadius: 22,
                  padding: "18px 22px",
                  background: "rgba(30, 41, 59, 0.62)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  boxShadow: "0 14px 32px rgba(0,0,0,0.28)",
                  backdropFilter: "blur(6px)",
                  WebkitBackdropFilter: "blur(6px)",
                }}
              >
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 800,
                    color: "rgba(255,255,255,0.78)",
                    marginBottom: 6,
                    letterSpacing: "0.03em",
                    textShadow: "0 2px 10px rgba(0,0,0,0.9)",
                  }}
                >
                  NEXT
                </div>

                <div
                  style={{
                    fontSize: 36,
                    fontWeight: 900,
                    lineHeight: 1.15,
                    color: "#ffffff",
                    wordBreak: "break-word",
                    textShadow:
                      "0 4px 16px rgba(0,0,0,0.92), 0 0 8px rgba(0,0,0,0.65)",
                  }}
                >
                  {nextPlayerName}
                </div>
                {nextPlayerIsPriority && (
                  <div
                    style={{
                      display: "inline-block",
                      marginTop: 8,
                      fontSize: 14,
                      fontWeight: 800,
                      color: "#92400e",
                      background: "#fef3c7",
                      padding: "4px 10px",
                      borderRadius: 999,
                    }}
                  >
                    PRIORITY TICKET
                  </div>
                )}
              </div>

              <div
                style={{
                  borderRadius: 22,
                  padding: "18px 22px",
                  background: "rgba(30, 41, 59, 0.62)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  boxShadow: "0 14px 32px rgba(0,0,0,0.28)",
                  backdropFilter: "blur(6px)",
                  WebkitBackdropFilter: "blur(6px)",
                }}
              >
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    color: "rgba(255,255,255,0.78)",
                    marginBottom: 10,
                    letterSpacing: "0.03em",
                    textShadow: "0 2px 10px rgba(0,0,0,0.9)",
                  }}
                >
                  WAITING LIST
                </div>

                {waitingListAfterNext.length === 0 ? (
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      color: "rgba(255,255,255,0.9)",
                      textShadow:
                        "0 4px 16px rgba(0,0,0,0.92), 0 0 8px rgba(0,0,0,0.65)",
                    }}
                  >
                    表示なし
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gap: 8,
                    }}
                  >
                    {waitingListAfterNext.map((user, index) => (
                      <div
                        key={user.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "10px 12px",
                          borderRadius: 14,
                          background: "rgba(255,255,255,0.08)",
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        <div
                          style={{
                            minWidth: 28,
                            height: 28,
                            borderRadius: 999,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "rgba(255,255,255,0.14)",
                            color: "#ffffff",
                            fontSize: 14,
                            fontWeight: 900,
                            textShadow: "0 2px 8px rgba(0,0,0,0.85)",
                            flexShrink: 0,
                          }}
                        >
                          {index + 2}
                        </div>

                        <div
                          style={{
                            fontSize: 22,
                            fontWeight: 800,
                            lineHeight: 1.2,
                            color: "#ffffff",
                            wordBreak: "break-word",
                            textShadow:
                              "0 4px 14px rgba(0,0,0,0.92), 0 0 8px rgba(0,0,0,0.65)",
                          }}
                        >
                          {user.name}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div
              style={{
                borderRadius: 22,
                padding: "18px 22px",
                background: "rgba(30, 41, 59, 0.62)",
                border: "1px solid rgba(255,255,255,0.12)",
                boxShadow: "0 14px 32px rgba(0,0,0,0.28)",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                minHeight: 180,
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: "rgba(255,255,255,0.78)",
                  marginBottom: 6,
                  letterSpacing: "0.03em",
                  textShadow: "0 2px 10px rgba(0,0,0,0.9)",
                }}
              >
                WAITING
              </div>

              <div
                style={{
                  fontSize: 42,
                  fontWeight: 900,
                  lineHeight: 1.1,
                  color: "#ffffff",
                  textShadow:
                    "0 4px 16px rgba(0,0,0,0.92), 0 0 8px rgba(0,0,0,0.65)",
                }}
              >
                {waitingCount}人
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
