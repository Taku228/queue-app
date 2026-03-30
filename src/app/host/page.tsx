"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import {
  auth,
  db,
  firebaseClientInitError,
  isFirebaseConfigured,
} from "../../lib/firebase";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  writeBatch,
} from "firebase/firestore";

type QueueUser = {
  id: string;
  name: string;
  createdAt: number;
  participantToken?: string;
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
type PlanType = "free" | "pro" | "business";

type SubscriptionConfig = {
  plan: PlanType;
};

type SubscriptionPricing = {
  proMonthlyYen: number;
  businessMonthlyYen: number;
};

type OverlayTheme = {
  cardBackground: string;
  cardText: string;
};

const DEFAULT_SETTINGS: QueueSettings = {
  maxActivePlayers: 2,
  maxBattlesPerPlayer: 2,
};

const PLAN_LIMITS: Record<
  PlanType,
  { maxActivePlayers: number; label: string }
> = {
  free: { maxActivePlayers: 2, label: "無料版" },
  pro: { maxActivePlayers: 4, label: "有料版 Pro" },
  business: {
    maxActivePlayers: 8,
    label: "有料版 Business",
  },
};

const DEFAULT_PRICING: SubscriptionPricing = {
  proMonthlyYen: 980,
  businessMonthlyYen: 2980,
};

const DEFAULT_OVERLAY_THEME: OverlayTheme = {
  cardBackground: "rgba(30, 41, 59, 0.62)",
  cardText: "#ffffff",
};

const getPlayerStatsId = (name: string) =>
  encodeURIComponent(name.trim().toLowerCase());

const normalizeName = (name: string) => name.trim().toLowerCase();

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  fontSize: 14,
  boxSizing: "border-box",
};

export default function HostPage() {
  const [user, setUser] = useState<User | null>(null);
  const [queue, setQueue] = useState<QueueUser[]>([]);
  const [activePlayers, setActivePlayers] = useState<ActivePlayer[]>([]);
  const [settings, setSettings] = useState<QueueSettings>(DEFAULT_SETTINGS);
  const [maxActivePlayersInput, setMaxActivePlayersInput] = useState(
    String(DEFAULT_SETTINGS.maxActivePlayers)
  );
  const [maxBattlesInput, setMaxBattlesInput] = useState(
    String(DEFAULT_SETTINGS.maxBattlesPerPlayer)
  );
  const [playerStatsMap, setPlayerStatsMap] = useState<Record<string, number>>(
    {}
  );
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("info");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionConfig>({
    plan: "free",
  });
  const [pricing, setPricing] = useState<SubscriptionPricing>(DEFAULT_PRICING);
  const [pricingInput, setPricingInput] = useState({
    proMonthlyYen: String(DEFAULT_PRICING.proMonthlyYen),
    businessMonthlyYen: String(DEFAULT_PRICING.businessMonthlyYen),
  });
  const [isSavingPricing, setIsSavingPricing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [overlayTheme, setOverlayTheme] = useState<OverlayTheme>(DEFAULT_OVERLAY_THEME);
  const [isSavingOverlayTheme, setIsSavingOverlayTheme] = useState(false);

  const hostUid =
    process.env.NEXT_PUBLIC_HOST_UID ?? "Ns5kRjvsbfZQnNoSUTiQ68L3DNV2";

  const setStatusMessage = (text: string, type: MessageType = "info") => {
    setMessage(text);
    setMessageType(type);
  };

  useEffect(() => {
    if (!isFirebaseConfigured || firebaseClientInitError) {
      return;
    }

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
    });

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
              participantToken: typeof raw.participantToken === "string" ? raw.participantToken : "",
            };
          })
          .sort((a, b) => a.createdAt - b.createdAt);

        setQueue(data);
      },
      (error) => {
        console.error("host queue onSnapshot error:", error);
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
        console.error("host activePlayers onSnapshot error:", error);
        setStatusMessage("プレイ中情報の読み込みに失敗しました。", "error");
      }
    );

    const unsubscribeSettings = onSnapshot(
      doc(db, "config", "queueSettings"),
      (snapshot) => {
        if (!snapshot.exists()) {
          setSettings(DEFAULT_SETTINGS);
          setMaxActivePlayersInput(String(DEFAULT_SETTINGS.maxActivePlayers));
          setMaxBattlesInput(String(DEFAULT_SETTINGS.maxBattlesPerPlayer));
          return;
        }

        const raw = snapshot.data();

        const nextSettings: QueueSettings = {
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
        };

        setSettings(nextSettings);
        setMaxActivePlayersInput(String(nextSettings.maxActivePlayers));
        setMaxBattlesInput(String(nextSettings.maxBattlesPerPlayer));
      },
      (error) => {
        console.error("host queueSettings onSnapshot error:", error);
        setStatusMessage("設定の読み込みに失敗しました。", "error");
      }
    );

    const unsubscribePlayerStats = onSnapshot(
      collection(db, "playerStats"),
      (snapshot) => {
        const nextMap: Record<string, number> = {};

        snapshot.docs.forEach((docItem) => {
          const raw = docItem.data();
          const name = typeof raw.name === "string" ? raw.name : "";
          const totalBattles =
            typeof raw.totalBattles === "number" ? raw.totalBattles : 0;

          if (name.trim()) {
            nextMap[normalizeName(name)] = totalBattles;
          }
        });

        setPlayerStatsMap(nextMap);
      },
      (error) => {
        console.error("host playerStats onSnapshot error:", error);
        setStatusMessage("対戦数の読み込みに失敗しました。", "error");
      }
    );

    const unsubscribeSubscription = onSnapshot(
      doc(db, "config", "subscription"),
      (snapshot) => {
        if (!snapshot.exists()) {
          setSubscription({ plan: "free" });
          return;
        }
        const raw = snapshot.data();
        const plan =
          raw.plan === "pro" || raw.plan === "business" ? raw.plan : "free";
        setSubscription({ plan });
      },
      (error) => {
        console.error("host subscription onSnapshot error:", error);
        setStatusMessage("プラン設定の読み込みに失敗しました。", "error");
      }
    );

    const unsubscribePricing = onSnapshot(
      doc(db, "config", "subscriptionPricing"),
      (snapshot) => {
        if (!snapshot.exists()) {
          setPricing(DEFAULT_PRICING);
          setPricingInput({
            proMonthlyYen: String(DEFAULT_PRICING.proMonthlyYen),
            businessMonthlyYen: String(DEFAULT_PRICING.businessMonthlyYen),
          });
          return;
        }
        const raw = snapshot.data();
        const nextPricing: SubscriptionPricing = {
          proMonthlyYen:
            typeof raw.proMonthlyYen === "number" && raw.proMonthlyYen > 0
              ? raw.proMonthlyYen
              : DEFAULT_PRICING.proMonthlyYen,
          businessMonthlyYen:
            typeof raw.businessMonthlyYen === "number" && raw.businessMonthlyYen > 0
              ? raw.businessMonthlyYen
              : DEFAULT_PRICING.businessMonthlyYen,
        };
        setPricing(nextPricing);
        setPricingInput({
          proMonthlyYen: String(nextPricing.proMonthlyYen),
          businessMonthlyYen: String(nextPricing.businessMonthlyYen),
        });
      },
      (error) => {
        console.error("host subscriptionPricing onSnapshot error:", error);
        setStatusMessage("料金設定の読み込みに失敗しました。", "error");
      }
    );

    const unsubscribeOverlayTheme = onSnapshot(
      doc(db, "config", "overlayTheme"),
      (snapshot) => {
        if (!snapshot.exists()) {
          setOverlayTheme(DEFAULT_OVERLAY_THEME);
          return;
        }
        const raw = snapshot.data();
        setOverlayTheme({
          cardBackground:
            typeof raw.cardBackground === "string" && raw.cardBackground.trim()
              ? raw.cardBackground
              : DEFAULT_OVERLAY_THEME.cardBackground,
          cardText:
            typeof raw.cardText === "string" && raw.cardText.trim()
              ? raw.cardText
              : DEFAULT_OVERLAY_THEME.cardText,
        });
      },
      (error) => {
        console.error("host overlayTheme onSnapshot error:", error);
        setStatusMessage("OBSカラー設定の読み込みに失敗しました。", "error");
      }
    );

    return () => {
      unsubscribeAuth();
      unsubscribeQueue();
      unsubscribeActivePlayers();
      unsubscribeSettings();
      unsubscribePlayerStats();
      unsubscribeSubscription();
      unsubscribePricing();
      unsubscribeOverlayTheme();
    };
  }, []);

  useEffect(() => {
    if (!message) return;

    const timer = window.setTimeout(() => {
      setMessage("");
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [message]);

  const isHost = !!user && user.uid === hostUid;
  const hasOpenSlot = activePlayers.length < settings.maxActivePlayers;

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

  const getBattleCount = (name: string) => {
    return playerStatsMap[normalizeName(name)] ?? 0;
  };

  const getCurrentSessionBattles = (player: ActivePlayer) => {
    const totalBattles = getBattleCount(player.name);
    const currentSessionBattles = totalBattles - player.joinedTotalBattles;
    return currentSessionBattles >= 0 ? currentSessionBattles : 0;
  };

  const loginWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setStatusMessage("ログインしました。", "success");
    } catch (error) {
      console.error(error);
      setStatusMessage("Googleログインに失敗しました。", "error");
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setStatusMessage("ログアウトしました。", "info");
    } catch (error) {
      console.error(error);
      setStatusMessage("ログアウトに失敗しました。", "error");
    }
  };

  const saveSettings = async () => {
    if (!isHost || isSavingSettings) return;

    const parsedMaxActivePlayers = Number(maxActivePlayersInput);
    const parsedMaxBattles = Number(maxBattlesInput);

    if (
      !Number.isInteger(parsedMaxActivePlayers) ||
      parsedMaxActivePlayers <= 0
    ) {
      setStatusMessage("同時参加人数は 1 以上の整数で入力してください。", "error");
      return;
    }

    if (parsedMaxActivePlayers > planLimit.maxActivePlayers) {
      setStatusMessage(
        `${PLAN_LIMITS[subscription.plan].label} の同時参加人数上限は ${planLimit.maxActivePlayers} 人です。`,
        "error"
      );
      return;
    }

    if (!Number.isInteger(parsedMaxBattles) || parsedMaxBattles <= 0) {
      setStatusMessage("最大対戦数は 1 以上の整数で入力してください。", "error");
      return;
    }

    setIsSavingSettings(true);

    try {
      await setDoc(doc(db, "config", "queueSettings"), {
        maxActivePlayers: parsedMaxActivePlayers,
        maxBattlesPerPlayer: parsedMaxBattles,
        updatedAt: Date.now(),
      });

      setStatusMessage("設定を保存しました。", "success");
    } catch (error) {
      console.error(error);
      setStatusMessage("設定の保存に失敗しました。", "error");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const syncActivePlayers = async (players: ActivePlayer[]) => {
    await setDoc(doc(db, "status", "activePlayers"), {
      players,
      updatedAt: Date.now(),
    });
  };

  const addNextPlayerToActive = async () => {
    if (!isHost || isProcessing) return;

    if (queue.length === 0) {
      setStatusMessage("待機列が空です。", "error");
      return;
    }

    if (activePlayers.length >= settings.maxActivePlayers) {
      setStatusMessage(
        `同時参加人数の上限 ${settings.maxActivePlayers} 人に達しています。`,
        "error"
      );
      return;
    }

    const nextUser = queue[0];
    const normalizedName = normalizeName(nextUser.name);

    const alreadyActive = activePlayers.some(
      (player) => normalizeName(player.name) === normalizedName
    );

    if (alreadyActive) {
      setStatusMessage("その名前はすでにプレイ中です。", "error");
      return;
    }

    setIsProcessing(true);

    try {
      const batch = writeBatch(db);
      const totalBattlesAtJoin = getBattleCount(nextUser.name);

      batch.delete(doc(db, "queue", nextUser.id));
      batch.set(doc(db, "status", "activePlayers"), {
        players: [
          ...activePlayers,
          {
            name: nextUser.name,
            startedAt: Date.now(),
            joinedTotalBattles: totalBattlesAtJoin,
          },
        ],
        updatedAt: Date.now(),
      });

      await batch.commit();
      setStatusMessage(`${nextUser.name} をプレイ中に追加しました。`, "success");
    } catch (error) {
      console.error(error);
      setStatusMessage("プレイ中への追加に失敗しました。", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const endMatch = async () => {
    if (!isHost || isProcessing) return;

    if (activePlayers.length === 0) {
      setStatusMessage("プレイ中の参加者がいません。", "error");
      return;
    }

    setIsProcessing(true);

    try {
      const batch = writeBatch(db);

      const incrementedTotals = activePlayers.map((player) => {
        const currentTotal = getBattleCount(player.name);
        const nextTotal = currentTotal + 1;

        batch.set(
          doc(db, "playerStats", getPlayerStatsId(player.name)),
          {
            name: player.name,
            totalBattles: nextTotal,
            updatedAt: Date.now(),
          },
          { merge: true }
        );

        return {
          player,
          nextTotal,
          reachedLimit: nextTotal >= settings.maxBattlesPerPlayer,
        };
      });

      if (queue.length === 0) {
        batch.set(doc(db, "status", "activePlayers"), {
          players: activePlayers,
          updatedAt: Date.now(),
        });

        await batch.commit();
        setStatusMessage(
          "試合終了を反映しました。待機がいないためプレイ中はそのままです。",
          "success"
        );
        return;
      }

      const limitReachedIndexes = incrementedTotals
        .map((item, index) => ({ index, reachedLimit: item.reachedLimit }))
        .filter((item) => item.reachedLimit)
        .map((item) => item.index);

      const removableCount = Math.min(limitReachedIndexes.length, queue.length);
      const removableIndexSet = new Set(
        limitReachedIndexes.slice(0, removableCount)
      );

      const remainingPlayers = incrementedTotals
        .filter((_, index) => !removableIndexSet.has(index))
        .map((item) => item.player);

      const replacements = queue.slice(0, removableCount).map((user) => ({
        name: user.name,
        startedAt: Date.now(),
        joinedTotalBattles: getBattleCount(user.name),
      }));

      queue.slice(0, removableCount).forEach((user) => {
        batch.delete(doc(db, "queue", user.id));
      });

      batch.set(doc(db, "status", "activePlayers"), {
        players: [...remainingPlayers, ...replacements],
        updatedAt: Date.now(),
      });

      await batch.commit();

      if (removableCount > 0) {
        setStatusMessage(
          `試合終了を反映しました。${removableCount} 人を入れ替えました。`,
          "success"
        );
      } else {
        setStatusMessage(
          "試合終了を反映しました。上限到達者はいませんでした。",
          "success"
        );
      }
    } catch (error) {
      console.error(error);
      setStatusMessage("試合終了処理に失敗しました。", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const removeActivePlayer = async (playerName: string) => {
    if (!isHost || isProcessing) return;

    setIsProcessing(true);

    try {
      const nextPlayers = activePlayers.filter(
        (player) => player.name !== playerName
      );
      await syncActivePlayers(nextPlayers);
      setStatusMessage(`${playerName} をプレイ中から外しました。`, "success");
    } catch (error) {
      console.error(error);
      setStatusMessage("プレイ中からの削除に失敗しました。", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const returnActivePlayerToBack = async (playerName: string) => {
    if (!isHost || isProcessing) return;

    setIsProcessing(true);

    try {
      const batch = writeBatch(db);

      const nextPlayers = activePlayers.filter(
        (player) => player.name !== playerName
      );

      batch.set(doc(db, "status", "activePlayers"), {
        players: nextPlayers,
        updatedAt: Date.now(),
      });

      const newQueueRef = doc(collection(db, "queue"));
      batch.set(newQueueRef, {
        name: playerName,
        createdAt: Date.now(),
      });

      await batch.commit();
      setStatusMessage(`${playerName} を待機列の最後尾に戻しました。`, "success");
    } catch (error) {
      console.error(error);
      setStatusMessage("最後尾へ戻す処理に失敗しました。", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const incrementBattleCount = async (playerName: string) => {
    if (!isHost || isProcessing) return;

    setIsProcessing(true);

    try {
      const statsRef = doc(db, "playerStats", getPlayerStatsId(playerName));
      const currentBattles = getBattleCount(playerName);

      await setDoc(
        statsRef,
        {
          name: playerName,
          totalBattles: currentBattles + 1,
          updatedAt: Date.now(),
        },
        { merge: true }
      );

      setStatusMessage(
        `${playerName} の配信通算を ${currentBattles + 1} 戦に更新しました。`,
        "success"
      );
    } catch (error) {
      console.error(error);
      setStatusMessage("対戦数の更新に失敗しました。", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const incrementAllActivePlayers = async () => {
    if (!isHost || isProcessing) return;

    if (activePlayers.length === 0) {
      setStatusMessage("プレイ中の参加者がいません。", "error");
      return;
    }

    setIsProcessing(true);

    try {
      const batch = writeBatch(db);

      for (const player of activePlayers) {
        const statsRef = doc(db, "playerStats", getPlayerStatsId(player.name));
        const currentBattles = getBattleCount(player.name);

        batch.set(
          statsRef,
          {
            name: player.name,
            totalBattles: currentBattles + 1,
            updatedAt: Date.now(),
          },
          { merge: true }
        );
      }

      await batch.commit();
      setStatusMessage("プレイ中の全員を +1戦 しました。", "success");
    } catch (error) {
      console.error(error);
      setStatusMessage("全員の対戦数更新に失敗しました。", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const deleteQueueUser = async (queueId: string, queueName: string) => {
    if (!isHost || isProcessing) return;

    setIsProcessing(true);

    try {
      await deleteDoc(doc(db, "queue", queueId));
      setStatusMessage(`${queueName} を待機列から削除しました。`, "success");
    } catch (error) {
      console.error(error);
      setStatusMessage("待機列からの削除に失敗しました。", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const resetQueue = async () => {
    if (!isHost || isProcessing) return;

    if (queue.length === 0) {
      setStatusMessage("待機列は空です。", "info");
      return;
    }

    setIsProcessing(true);

    try {
      const batch = writeBatch(db);

      queue.forEach((user) => {
        batch.delete(doc(db, "queue", user.id));
      });

      await batch.commit();
      setStatusMessage("待機列を全削除しました。", "success");
    } catch (error) {
      console.error(error);
      setStatusMessage("待機列のリセットに失敗しました。", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const clearActivePlayers = async () => {
    if (!isHost || isProcessing) return;

    if (activePlayers.length === 0) {
      setStatusMessage("プレイ中の参加者はいません。", "info");
      return;
    }

    setIsProcessing(true);

    try {
      await syncActivePlayers([]);
      setStatusMessage("プレイ中の参加者を全クリアしました。", "success");
    } catch (error) {
      console.error(error);
      setStatusMessage("プレイ中のクリアに失敗しました。", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const fullReset = async () => {
    if (!isHost || isProcessing) return;

    if (queue.length === 0 && activePlayers.length === 0) {
      setStatusMessage("すでに空の状態です。", "info");
      return;
    }

    setIsProcessing(true);

    try {
      const batch = writeBatch(db);

      queue.forEach((user) => {
        batch.delete(doc(db, "queue", user.id));
      });

      batch.set(doc(db, "status", "activePlayers"), {
        players: [],
        updatedAt: Date.now(),
      });

      await batch.commit();
      setStatusMessage("全リセットしました。", "success");
    } catch (error) {
      console.error(error);
      setStatusMessage("全リセットに失敗しました。", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const activeStatusText = useMemo(() => {
    return `${activePlayers.length} / ${settings.maxActivePlayers} 人`;
  }, [activePlayers.length, settings.maxActivePlayers]);
  const planLimit = PLAN_LIMITS[subscription.plan];

  const savePlan = async (plan: PlanType) => {
    if (!isHost || isSavingPlan) return;

    setIsSavingPlan(true);
    try {
      await setDoc(
        doc(db, "config", "subscription"),
        { plan, updatedAt: Date.now() },
        { merge: true }
      );

      const capped = Math.min(settings.maxActivePlayers, PLAN_LIMITS[plan].maxActivePlayers);
      if (capped !== settings.maxActivePlayers) {
        await setDoc(
          doc(db, "config", "queueSettings"),
          { maxActivePlayers: capped, updatedAt: Date.now() },
          { merge: true }
        );
      }

      setStatusMessage(`プランを ${PLAN_LIMITS[plan].label} に変更しました。`, "success");
    } catch (error) {
      console.error(error);
      setStatusMessage("プラン変更に失敗しました。", "error");
    } finally {
      setIsSavingPlan(false);
    }
  };

  const savePricing = async () => {
    if (!isHost || isSavingPricing) return;

    const proMonthlyYen = Number(pricingInput.proMonthlyYen);
    const businessMonthlyYen = Number(pricingInput.businessMonthlyYen);

    if (!Number.isInteger(proMonthlyYen) || proMonthlyYen <= 0) {
      setStatusMessage("Pro価格は 1 以上の整数で入力してください。", "error");
      return;
    }
    if (!Number.isInteger(businessMonthlyYen) || businessMonthlyYen <= 0) {
      setStatusMessage("Business価格は 1 以上の整数で入力してください。", "error");
      return;
    }

    setIsSavingPricing(true);
    try {
      await setDoc(
        doc(db, "config", "subscriptionPricing"),
        { proMonthlyYen, businessMonthlyYen, updatedAt: Date.now() },
        { merge: true }
      );
      setStatusMessage("料金設定を保存しました。", "success");
    } catch (error) {
      console.error(error);
      setStatusMessage("料金設定の保存に失敗しました。", "error");
    } finally {
      setIsSavingPricing(false);
    }
  };

  const saveOverlayTheme = async () => {
    if (!isHost || isSavingOverlayTheme) return;
    if (subscription.plan === "free") {
      setStatusMessage("OBSカード色変更は有料プラン（Pro以上）で利用できます。", "error");
      return;
    }

    if (!overlayTheme.cardBackground.trim() || !overlayTheme.cardText.trim()) {
      setStatusMessage("OBSカラーは未入力にできません。", "error");
      return;
    }

    setIsSavingOverlayTheme(true);
    try {
      await setDoc(
        doc(db, "config", "overlayTheme"),
        { ...overlayTheme, updatedAt: Date.now() },
        { merge: true }
      );
      setStatusMessage("OBSカード色を保存しました。", "success");
    } catch (error) {
      console.error(error);
      setStatusMessage("OBSカード色の保存に失敗しました。", "error");
    } finally {
      setIsSavingOverlayTheme(false);
    }
  };

  useEffect(() => {
    if (!user || !isHost) return;

    const unsubscribeLicense = onSnapshot(
      doc(db, "licenses", user.uid),
      async (snapshot) => {
        if (!snapshot.exists()) return;
        const raw = snapshot.data();
        const purchasedPlan: PlanType =
          raw.plan === "pro" || raw.plan === "business" ? raw.plan : "free";

        if (purchasedPlan === subscription.plan) return;

        try {
          await setDoc(
            doc(db, "config", "subscription"),
            { plan: purchasedPlan, updatedAt: Date.now(), source: "license" },
            { merge: true }
          );
          setStatusMessage(
            `購入プラン(${PLAN_LIMITS[purchasedPlan].label})を自動反映しました。`,
            "success"
          );
        } catch (error) {
          console.error(error);
          setStatusMessage("購入プランの自動反映に失敗しました。", "error");
        }
      },
      (error) => {
        console.error("host license onSnapshot error:", error);
      }
    );

    return () => unsubscribeLicense();
  }, [user, isHost, subscription.plan]);

  if (!isFirebaseConfigured || !!firebaseClientInitError) {
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
            Firebase設定が未完了です
          </h1>
          <p style={{ color: "#475569", lineHeight: 1.8, margin: 0 }}>
            `.env.local` に Firebase の公開キーを設定すると host 画面が使えるようになります。
            README の「初回セットアップ」を上から順に進めてください。
            {firebaseClientInitError ? (
              <>
                <br />
                初期化エラー: {firebaseClientInitError}
              </>
            ) : null}
          </p>
        </div>
      </main>
    );
  }

  if (!user) {
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
            maxWidth: 480,
            background: "#ffffff",
            borderRadius: 20,
            padding: 24,
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.08)",
          }}
        >
          <h1
            style={{
              fontSize: 28,
              fontWeight: "bold",
              marginTop: 0,
              marginBottom: 8,
            }}
          >
            host
          </h1>

          <p
            style={{
              color: "#475569",
              lineHeight: 1.7,
              marginTop: 0,
              marginBottom: 16,
            }}
          >
            配信者用画面です。Googleログインしてください。
          </p>

          <button
            onClick={() => void loginWithGoogle()}
            style={{
              width: "100%",
              minHeight: 52,
              border: "none",
              borderRadius: 14,
              backgroundColor: "#2563eb",
              color: "#fff",
              fontSize: 17,
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            Googleでログイン
          </button>
        </div>
      </main>
    );
  }

  if (!isHost) {
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
            maxWidth: 520,
            background: "#ffffff",
            borderRadius: 20,
            padding: 24,
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.08)",
          }}
        >
          <h1
            style={{
              fontSize: 28,
              fontWeight: "bold",
              marginTop: 0,
              marginBottom: 8,
            }}
          >
            権限がありません
          </h1>

          <p
            style={{
              color: "#475569",
              lineHeight: 1.7,
              marginTop: 0,
              marginBottom: 16,
            }}
          >
            このアカウントでは host 画面を利用できません。
          </p>

          <button
            onClick={() => void logout()}
            style={{
              width: "100%",
              minHeight: 48,
              border: "none",
              borderRadius: 14,
              backgroundColor: "#64748b",
              color: "#fff",
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            ログアウト
          </button>

          <button
            onClick={() => setIsSettingsOpen((prev) => !prev)}
            style={{
              minHeight: 44,
              padding: "10px 16px",
              borderRadius: 12,
              border: "none",
              backgroundColor: "#0f766e",
              color: "#fff",
              fontSize: 14,
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            {isSettingsOpen ? "設定を閉じる" : "設定を開く"}
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
          "linear-gradient(180deg, #eff6ff 0%, #f8fafc 45%, #ffffff 100%)",
        padding: "16px 12px 32px",
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          display: "grid",
          gap: 14,
        }}
      >
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 20,
            padding: 18,
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.08)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 28,
                fontWeight: "bold",
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              host
            </h1>
            <p
              style={{
                margin: "6px 0 0 0",
                color: "#475569",
                fontSize: 14,
              }}
            >
              ログイン中: {user.email ?? user.uid}
            </p>
          </div>

          <button
            onClick={() => void logout()}
            style={{
              minHeight: 44,
              padding: "10px 16px",
              borderRadius: 12,
              border: "none",
              backgroundColor: "#64748b",
              color: "#fff",
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            ログアウト
          </button>
        </div>

        {message && (
          <div
            style={{
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

        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 14,
            padding: "10px 12px",
            boxShadow: "0 6px 18px rgba(0, 0, 0, 0.06)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 13, color: "#334155" }}>
            設定画面を開いてプラン・料金を変更できます
          </div>
          <button
            onClick={() => setIsSettingsOpen((prev) => !prev)}
            style={{
              minHeight: 36,
              padding: "8px 12px",
              borderRadius: 10,
              border: "none",
              backgroundColor: "#0f766e",
              color: "#fff",
              fontSize: 13,
              fontWeight: "bold",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            {isSettingsOpen ? "設定を閉じる" : "設定を開く"}
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 14,
          }}
        >
          <div
            style={{
              backgroundColor: "#dbeafe",
              color: "#1e3a8a",
              borderRadius: 18,
              padding: 18,
            }}
          >
            <div style={{ fontSize: 13, opacity: 0.9, marginBottom: 6 }}>
              ACTIVE SLOTS
            </div>
            <div style={{ fontSize: 30, fontWeight: "bold" }}>
              {activeStatusText}
            </div>
          </div>

          <div
            style={{
              backgroundColor: "#dcfce7",
              color: "#166534",
              borderRadius: 18,
              padding: 18,
            }}
          >
            <div style={{ fontSize: 13, opacity: 0.9, marginBottom: 6 }}>
              WAITING
            </div>
            <div style={{ fontSize: 30, fontWeight: "bold" }}>
              {queue.length}人
            </div>
          </div>

          <div
            style={{
              backgroundColor: "#fef3c7",
              color: "#92400e",
              borderRadius: 18,
              padding: 18,
            }}
          >
            <div style={{ fontSize: 13, opacity: 0.9, marginBottom: 6 }}>
              SETTINGS
            </div>
            <div style={{ fontSize: 16, fontWeight: "bold", lineHeight: 1.7 }}>
              同時参加人数: {settings.maxActivePlayers}人
              <br />
              最大対戦数: {settings.maxBattlesPerPlayer}戦
            </div>
          </div>


        </div>

        {isSettingsOpen && (
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
              fontSize: 18,
              fontWeight: "bold",
              marginBottom: 14,
            }}
          >
            設定変更
          </div>

          <div
            style={{
              marginBottom: 14,
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #e2e8f0",
              backgroundColor: "#f8fafc",
            }}
          >
            <div style={{ fontWeight: "bold", marginBottom: 8 }}>プラン</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(Object.keys(PLAN_LIMITS) as PlanType[]).map((plan) => (
                <button
                  key={plan}
                  onClick={() => void savePlan(plan)}
                  disabled={isSavingPlan}
                  style={{
                    minHeight: 36,
                    padding: "8px 12px",
                    borderRadius: 9999,
                    border:
                      subscription.plan === plan
                        ? "2px solid #2563eb"
                        : "1px solid #cbd5e1",
                    backgroundColor: "#fff",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: isSavingPlan ? "default" : "pointer",
                  }}
                >
                  {PLAN_LIMITS[plan].label}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
              現在プラン: {PLAN_LIMITS[subscription.plan].label} / 同時参加上限:{" "}
              {planLimit.maxActivePlayers} 人
            </div>
          </div>

          <div
            style={{
              marginBottom: 14,
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #e2e8f0",
              backgroundColor: "#f8fafc",
            }}
          >
            <div style={{ fontWeight: "bold", marginBottom: 8 }}>プラン料金</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 8,
              }}
            >
              <input
                value={pricingInput.proMonthlyYen}
                onChange={(e) =>
                  setPricingInput((prev) => ({
                    ...prev,
                    proMonthlyYen: e.target.value,
                  }))
                }
                inputMode="numeric"
                placeholder="Pro 月額(円)"
                style={inputStyle}
              />
              <input
                value={pricingInput.businessMonthlyYen}
                onChange={(e) =>
                  setPricingInput((prev) => ({
                    ...prev,
                    businessMonthlyYen: e.target.value,
                  }))
                }
                inputMode="numeric"
                placeholder="Business 月額(円)"
                style={inputStyle}
              />
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
              現在値: Pro ¥{pricing.proMonthlyYen.toLocaleString()} / Business ¥
              {pricing.businessMonthlyYen.toLocaleString()}
            </div>
            <button
              onClick={() => void savePricing()}
              disabled={isSavingPricing}
              style={{
                marginTop: 8,
                minHeight: 36,
                padding: "8px 12px",
                borderRadius: 10,
                border: "none",
                backgroundColor: isSavingPricing ? "#93c5fd" : "#2563eb",
                color: "#fff",
                fontSize: 13,
                fontWeight: "bold",
                cursor: isSavingPricing ? "default" : "pointer",
              }}
            >
              {isSavingPricing ? "保存中..." : "料金を保存"}
            </button>
          </div>

          <div
            style={{
              marginBottom: 14,
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #e2e8f0",
              backgroundColor: "#f8fafc",
            }}
          >
            <div style={{ fontWeight: "bold", marginBottom: 8 }}>
              OBSカード色（Pro / Business）
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 8,
              }}
            >
              <input
                value={overlayTheme.cardBackground}
                onChange={(e) =>
                  setOverlayTheme((prev) => ({
                    ...prev,
                    cardBackground: e.target.value,
                  }))
                }
                placeholder="カード背景色 (例: rgba(30,41,59,0.62))"
                style={inputStyle}
                disabled={subscription.plan === "free"}
              />
              <input
                value={overlayTheme.cardText}
                onChange={(e) =>
                  setOverlayTheme((prev) => ({
                    ...prev,
                    cardText: e.target.value,
                  }))
                }
                placeholder="カード文字色 (例: #ffffff)"
                style={inputStyle}
                disabled={subscription.plan === "free"}
              />
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
              Freeプランでは編集不可です。現在値: 背景 {overlayTheme.cardBackground} / 文字{" "}
              {overlayTheme.cardText}
            </div>
            <button
              onClick={() => void saveOverlayTheme()}
              disabled={isSavingOverlayTheme || subscription.plan === "free"}
              style={{
                marginTop: 8,
                minHeight: 36,
                padding: "8px 12px",
                borderRadius: 10,
                border: "none",
                backgroundColor:
                  isSavingOverlayTheme || subscription.plan === "free"
                    ? "#cbd5e1"
                    : "#0f766e",
                color: "#fff",
                fontSize: 13,
                fontWeight: "bold",
                cursor:
                  isSavingOverlayTheme || subscription.plan === "free"
                    ? "default"
                    : "pointer",
              }}
            >
              {isSavingOverlayTheme ? "保存中..." : "OBSカラーを保存"}
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
              marginBottom: 14,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 13,
                  color: "#64748b",
                  marginBottom: 6,
                }}
              >
                同時参加人数
              </div>
              <input
                value={maxActivePlayersInput}
                onChange={(e) => setMaxActivePlayersInput(e.target.value)}
                inputMode="numeric"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid #cbd5e1",
                  fontSize: 16,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <div
                style={{
                  fontSize: 13,
                  color: "#64748b",
                  marginBottom: 6,
                }}
              >
                1人あたり最大対戦数
              </div>
              <input
                value={maxBattlesInput}
                onChange={(e) => setMaxBattlesInput(e.target.value)}
                inputMode="numeric"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid #cbd5e1",
                  fontSize: 16,
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          <button
            onClick={() => void saveSettings()}
            disabled={isSavingSettings}
            style={{
              minHeight: 48,
              padding: "12px 18px",
              borderRadius: 12,
              border: "none",
              backgroundColor: isSavingSettings ? "#93c5fd" : "#2563eb",
              color: "#fff",
              fontSize: 16,
              fontWeight: "bold",
              cursor: isSavingSettings ? "default" : "pointer",
            }}
          >
            {isSavingSettings ? "保存中..." : "設定を保存"}
          </button>
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 14,
          }}
        >
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
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                marginBottom: 12,
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  fontWeight: "bold",
                }}
              >
                プレイ中
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <button
                  onClick={() => void addNextPlayerToActive()}
                  disabled={!hasOpenSlot || queue.length === 0 || isProcessing}
                  style={{
                    minHeight: 44,
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "none",
                    backgroundColor:
                      !hasOpenSlot || queue.length === 0 || isProcessing
                        ? "#93c5fd"
                        : "#2563eb",
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: "bold",
                    cursor:
                      !hasOpenSlot || queue.length === 0 || isProcessing
                        ? "default"
                        : "pointer",
                  }}
                >
                  次の人を追加
                </button>

                <button
                  onClick={() => void endMatch()}
                  disabled={isProcessing || activePlayers.length === 0}
                  style={{
                    minHeight: 44,
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "none",
                    backgroundColor:
                      isProcessing || activePlayers.length === 0
                        ? "#86efac"
                        : "#16a34a",
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: "bold",
                    cursor:
                      isProcessing || activePlayers.length === 0
                        ? "default"
                        : "pointer",
                  }}
                >
                  試合終了
                </button>
              </div>
            </div>

            {activePlayers.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  color: "#64748b",
                }}
              >
                現在プレイ中の参加者はいません。
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: 10,
                }}
              >
                {activePlayers.map((player, index) => {
                  const totalBattles = getBattleCount(player.name);
                  const currentSessionBattles = getCurrentSessionBattles(player);
                  const nextSessionBattle = currentSessionBattles + 1;
                  const nextTotalBattle = totalBattles + 1;

                  return (
                    <div
                      key={`${player.name}-${index}`}
                      style={{
                        borderRadius: 16,
                        backgroundColor: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        padding: 14,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: "bold",
                          marginBottom: 6,
                          color: "#0f172a",
                        }}
                      >
                        {player.name}
                      </div>

                      <div
                        style={{
                          fontSize: 13,
                          color: "#475569",
                          lineHeight: 1.7,
                          marginBottom: 10,
                        }}
                      >
                        今回 {currentSessionBattles}戦 / 配信通算 {totalBattles}戦
                        <br />
                        次は {nextSessionBattle}戦目 (合計 {nextTotalBattle}戦目)
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          onClick={() => void incrementBattleCount(player.name)}
                          disabled={isProcessing}
                          style={{
                            minHeight: 40,
                            padding: "8px 12px",
                            borderRadius: 10,
                            border: "none",
                            backgroundColor: "#16a34a",
                            color: "#fff",
                            fontSize: 14,
                            fontWeight: "bold",
                            cursor: isProcessing ? "default" : "pointer",
                          }}
                        >
                          +1戦
                        </button>

                        <button
                          onClick={() => void returnActivePlayerToBack(player.name)}
                          disabled={isProcessing}
                          style={{
                            minHeight: 40,
                            padding: "8px 12px",
                            borderRadius: 10,
                            border: "none",
                            backgroundColor: "#2563eb",
                            color: "#fff",
                            fontSize: 14,
                            fontWeight: "bold",
                            cursor: isProcessing ? "default" : "pointer",
                          }}
                        >
                          最後尾へ戻す
                        </button>

                        <button
                          onClick={() => void removeActivePlayer(player.name)}
                          disabled={isProcessing}
                          style={{
                            minHeight: 40,
                            padding: "8px 12px",
                            borderRadius: 10,
                            border: "none",
                            backgroundColor: "#ef4444",
                            color: "#fff",
                            fontSize: 14,
                            fontWeight: "bold",
                            cursor: isProcessing ? "default" : "pointer",
                          }}
                        >
                          クリア
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div
              style={{
                marginTop: 12,
                fontSize: 12,
                lineHeight: 1.7,
                color: "#64748b",
                backgroundColor: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                padding: "10px 12px",
              }}
            >
              試合終了ボタン:
              <br />
              ・プレイ中全員を +1戦
              <br />
              ・待機がいる場合のみ、上限到達者を自動で入れ替え
              <br />
              ・同時に上限到達したときは、先に参加した人から優先的に交代
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                marginTop: 14,
              }}
            >
              <button
                onClick={() => void incrementAllActivePlayers()}
                disabled={isProcessing || activePlayers.length === 0}
                style={{
                  minHeight: 42,
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "none",
                  backgroundColor:
                    isProcessing || activePlayers.length === 0
                      ? "#86efac"
                      : "#16a34a",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: "bold",
                  cursor:
                    isProcessing || activePlayers.length === 0
                      ? "default"
                      : "pointer",
                }}
              >
                プレイ中全員を+1戦
              </button>

              <button
                onClick={() => void clearActivePlayers()}
                disabled={isProcessing || activePlayers.length === 0}
                style={{
                  minHeight: 42,
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "none",
                  backgroundColor:
                    isProcessing || activePlayers.length === 0
                      ? "#fca5a5"
                      : "#ef4444",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: "bold",
                  cursor:
                    isProcessing || activePlayers.length === 0
                      ? "default"
                      : "pointer",
                }}
              >
                プレイ中を全クリア
              </button>
            </div>
          </div>

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
                fontSize: 18,
                fontWeight: "bold",
                marginBottom: 12,
              }}
            >
              待機リスト
            </div>

            {queue.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  color: "#64748b",
                }}
              >
                待機中の参加者はいません。
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: 10,
                }}
              >
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
                      backgroundColor: "#f8fafc",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: "bold",
                        color: "#0f172a",
                      }}
                    >
                      {index + 1}：{user.name}
                    </div>

                    <button
                      onClick={() => void deleteQueueUser(user.id, user.name)}
                      disabled={isProcessing}
                      style={{
                        minHeight: 38,
                        padding: "8px 12px",
                        borderRadius: 10,
                        border: "none",
                        backgroundColor: "#ef4444",
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: "bold",
                        cursor: isProcessing ? "default" : "pointer",
                        flexShrink: 0,
                      }}
                    >
                      削除
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                marginTop: 14,
              }}
            >
              <button
                onClick={() => void resetQueue()}
                disabled={isProcessing || queue.length === 0}
                style={{
                  minHeight: 42,
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "none",
                  backgroundColor:
                    isProcessing || queue.length === 0 ? "#fca5a5" : "#ef4444",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: "bold",
                  cursor:
                    isProcessing || queue.length === 0 ? "default" : "pointer",
                }}
              >
                待機列を全削除
              </button>

              <button
                onClick={() => void fullReset()}
                disabled={
                  isProcessing || (queue.length === 0 && activePlayers.length === 0)
                }
                style={{
                  minHeight: 42,
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "none",
                  backgroundColor:
                    isProcessing || (queue.length === 0 && activePlayers.length === 0)
                      ? "#c4b5fd"
                      : "#7c3aed",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: "bold",
                  cursor:
                    isProcessing || (queue.length === 0 && activePlayers.length === 0)
                      ? "default"
                      : "pointer",
                }}
              >
                全リセット
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
