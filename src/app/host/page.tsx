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
  getDoc,
  limit,
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
  free: { maxActivePlayers: 2, label: "辟｡譁咏沿" },
  pro: { maxActivePlayers: 4, label: "譛画侭迚・Pro" },
  business: {
    maxActivePlayers: 8,
    label: "譛画侭迚・Business",
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
        setStatusMessage("蠕・ｩ溷・縺ｮ隱ｭ縺ｿ霎ｼ縺ｿ縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲・, "error");
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
        setStatusMessage("繝励Ξ繧､荳ｭ諠・ｱ縺ｮ隱ｭ縺ｿ霎ｼ縺ｿ縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲・, "error");
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
        setStatusMessage("險ｭ螳壹・隱ｭ縺ｿ霎ｼ縺ｿ縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲・, "error");
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
        setStatusMessage("蟇ｾ謌ｦ謨ｰ縺ｮ隱ｭ縺ｿ霎ｼ縺ｿ縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲・, "error");
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
        setStatusMessage("繝励Λ繝ｳ險ｭ螳壹・隱ｭ縺ｿ霎ｼ縺ｿ縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲・, "error");
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
        setStatusMessage("譁咎≡險ｭ螳壹・隱ｭ縺ｿ霎ｼ縺ｿ縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲・, "error");
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
        setStatusMessage("OBS繧ｫ繝ｩ繝ｼ險ｭ螳壹・隱ｭ縺ｿ霎ｼ縺ｿ縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲・, "error");
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
      setStatusMessage("繝ｭ繧ｰ繧､繝ｳ縺励∪縺励◆縲・, "success");
    } catch (error) {
      console.error(error);
      setStatusMessage("Google繝ｭ繧ｰ繧､繝ｳ縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲・, "error");
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setStatusMessage("繝ｭ繧ｰ繧｢繧ｦ繝医＠縺ｾ縺励◆縲・, "info");
    } catch (error) {
      console.error(error);
      setStatusMessage("繝ｭ繧ｰ繧｢繧ｦ繝医↓螟ｱ謨励＠縺ｾ縺励◆縲・, "error");
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
      setStatusMessage("蜷梧凾蜿ょ刈莠ｺ謨ｰ縺ｯ 1 莉･荳翫・謨ｴ謨ｰ縺ｧ蜈･蜉帙＠縺ｦ縺上□縺輔＞縲・, "error");
      return;
    }

    if (parsedMaxActivePlayers > planLimit.maxActivePlayers) {
      setStatusMessage(
        `${PLAN_LIMITS[subscription.plan].label} 縺ｮ蜷梧凾蜿ょ刈莠ｺ謨ｰ荳企剞縺ｯ ${planLimit.maxActivePlayers} 莠ｺ縺ｧ縺吶Ａ,
        "error"
      );
      return;
    }

    if (!Number.isInteger(parsedMaxBattles) || parsedMaxBattles <= 0) {
      setStatusMessage("譛螟ｧ蟇ｾ謌ｦ謨ｰ縺ｯ 1 莉･荳翫・謨ｴ謨ｰ縺ｧ蜈･蜉帙＠縺ｦ縺上□縺輔＞縲・, "error");
      return;
    }

    setIsSavingSettings(true);

    try {
      await setDoc(doc(db, "config", "queueSettings"), {
        maxActivePlayers: parsedMaxActivePlayers,
        maxBattlesPerPlayer: parsedMaxBattles,
        updatedAt: Date.now(),
      });

      setStatusMessage("險ｭ螳壹ｒ菫晏ｭ倥＠縺ｾ縺励◆縲・, "success");
    } catch (error) {
      console.error(error);
      setStatusMessage("險ｭ螳壹・菫晏ｭ倥↓螟ｱ謨励＠縺ｾ縺励◆縲・, "error");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const createPriorityCode = async () => {
    if (!isHost || isProcessing) return;
    if (!canUsePriority) {
      setStatusMessage("辟｡譁咏沿縺ｧ縺ｯ蜆ｪ蜈医さ繝ｼ繝画ｩ溯・繧貞茜逕ｨ縺ｧ縺阪∪縺帙ｓ縲・, "error");
      return;
    }

    const label = codeLabelInput.trim();
    const priceYen = Number(codePriceInput);
    const remainingUses = Number(codeUsesInput);

    if (!label) {
      setStatusMessage("繝√こ繝・ヨ蜷阪ｒ蜈･蜉帙＠縺ｦ縺上□縺輔＞縲・, "error");
      return;
    }

    if (!Number.isInteger(priceYen) || priceYen <= 0) {
      setStatusMessage("萓｡譬ｼ縺ｯ 1 莉･荳翫・謨ｴ謨ｰ縺ｧ蜈･蜉帙＠縺ｦ縺上□縺輔＞縲・, "error");
      return;
    }

    if (!Number.isInteger(remainingUses) || remainingUses <= 0) {
      setStatusMessage("蛻ｩ逕ｨ蝗樊焚縺ｯ 1 莉･荳翫・謨ｴ謨ｰ縺ｧ蜈･蜉帙＠縺ｦ縺上□縺輔＞縲・, "error");
      return;
    }

    const code = `VIP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    setIsProcessing(true);
    try {
      const existing = await getDoc(doc(db, "priorityCodes", code));
      if (existing.exists()) {
        setStatusMessage("繧ｳ繝ｼ繝臥函謌舌↓螟ｱ謨励＠縺ｾ縺励◆縲ょ・隧ｦ陦後＠縺ｦ縺上□縺輔＞縲・, "error");
        return;
      }

      await setDoc(doc(db, "priorityCodes", code), {
        label,
        priceYen,
        remainingUses,
        redeemedCount: 0,
        isActive: true,
        createdAt: Date.now(),
        createdBy: user?.uid ?? "",
      });

      setStatusMessage(`蜆ｪ蜈医さ繝ｼ繝・${code} 繧堤匱陦後＠縺ｾ縺励◆縲Ａ, "success");
    } catch (error) {
      console.error(error);
      setStatusMessage("蜆ｪ蜈医さ繝ｼ繝峨・逋ｺ陦後↓螟ｱ謨励＠縺ｾ縺励◆縲・, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const issuePriorityTicketForBuyer = async () => {
    if (!isHost || isProcessing) return;
    if (!canUsePriority) {
      setStatusMessage("辟｡譁咏沿縺ｧ縺ｯ雉ｼ蜈･閠・髄縺代さ繝ｼ繝臥匱陦後・蛻ｩ逕ｨ縺ｧ縺阪∪縺帙ｓ縲・, "error");
      return;
    }

    const buyerName = buyerNameInput.trim();
    if (!buyerName) {
      setStatusMessage("雉ｼ蜈･閠・錐繧貞・蜉帙＠縺ｦ縺上□縺輔＞縲・, "error");
      return;
    }

    const priceYen = Number(codePriceInput);
    const remainingUses = Number(codeUsesInput);

    if (!Number.isInteger(priceYen) || priceYen <= 0) {
      setStatusMessage("萓｡譬ｼ縺ｯ 1 莉･荳翫・謨ｴ謨ｰ縺ｧ蜈･蜉帙＠縺ｦ縺上□縺輔＞縲・, "error");
      return;
    }

    if (!Number.isInteger(remainingUses) || remainingUses <= 0) {
      setStatusMessage("蛻ｩ逕ｨ蝗樊焚縺ｯ 1 莉･荳翫・謨ｴ謨ｰ縺ｧ蜈･蜉帙＠縺ｦ縺上□縺輔＞縲・, "error");
      return;
    }

    const code = `VIP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    setIsProcessing(true);
    try {
      await setDoc(doc(db, "priorityCodes", code), {
        label: `${buyerName}縺輔ｓ蟆ら畑`,
        priceYen,
        remainingUses,
        redeemedCount: 0,
        isActive: true,
        createdAt: Date.now(),
        createdBy: user?.uid ?? "",
        buyerName,
      });

      const message = [
        `${buyerName}縺輔ｓ縲∬ｳｼ蜈･縺ゅｊ縺後→縺・＃縺悶＞縺ｾ縺呻ｼ～,
        `蜆ｪ蜈亥盾蜉繧ｳ繝ｼ繝・ ${code}`,
        `蛻ｩ逕ｨ蜿ｯ閭ｽ蝗樊焚: ${remainingUses} 蝗杼,
        "viewer繝壹・繧ｸ縺ｧ繧ｳ繝ｼ繝牙・蜉帙＠縺ｦ蜿ょ刈縺励※縺上□縺輔＞縲・,
      ].join("\n");

      await navigator.clipboard.writeText(message);
      setBuyerNameInput("");
      setStatusMessage(
        `雉ｼ蜈･閠・髄縺代さ繝ｼ繝・${code} 繧堤匱陦後＠縲∵｡亥・譁・ｒ繧ｳ繝斐・縺励∪縺励◆縲Ａ,
        "success"
      );
    } catch (error) {
      console.error(error);
      setStatusMessage("雉ｼ蜈･閠・髄縺代さ繝ｼ繝峨・逋ｺ陦後↓螟ｱ謨励＠縺ｾ縺励◆縲・, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const togglePriorityCode = async (code: string, nextActive: boolean) => {
    if (!isHost || isProcessing) return;
    if (!canUsePriority) {
      setStatusMessage("辟｡譁咏沿縺ｧ縺ｯ蜆ｪ蜈医さ繝ｼ繝画ｩ溯・繧貞茜逕ｨ縺ｧ縺阪∪縺帙ｓ縲・, "error");
      return;
    }

    setIsProcessing(true);
    try {
      await setDoc(
        doc(db, "priorityCodes", code),
        { isActive: nextActive, updatedAt: Date.now() },
        { merge: true }
      );
      setStatusMessage(
        nextActive
          ? `${code} 繧呈怏蜉ｹ蛹悶＠縺ｾ縺励◆縲Ａ
          : `${code} 繧貞●豁｢縺励∪縺励◆縲Ａ,
        "success"
      );
    } catch (error) {
      console.error(error);
      setStatusMessage("繧ｳ繝ｼ繝臥憾諷九・譖ｴ譁ｰ縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲・, "error");
    } finally {
      setIsProcessing(false);
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
      setStatusMessage("蠕・ｩ溷・縺檎ｩｺ縺ｧ縺吶・, "error");
      return;
    }

    if (activePlayers.length >= settings.maxActivePlayers) {
      setStatusMessage(
        `蜷梧凾蜿ょ刈莠ｺ謨ｰ縺ｮ荳企剞 ${settings.maxActivePlayers} 莠ｺ縺ｫ驕斐＠縺ｦ縺・∪縺吶Ａ,
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
      setStatusMessage("縺昴・蜷榊燕縺ｯ縺吶〒縺ｫ繝励Ξ繧､荳ｭ縺ｧ縺吶・, "error");
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
      setStatusMessage(`${nextUser.name} 繧偵・繝ｬ繧､荳ｭ縺ｫ霑ｽ蜉縺励∪縺励◆縲Ａ, "success");
    } catch (error) {
      console.error(error);
      setStatusMessage("繝励Ξ繧､荳ｭ縺ｸ縺ｮ霑ｽ蜉縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲・, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const endMatch = async () => {
    if (!isHost || isProcessing) return;

    if (activePlayers.length === 0) {
      setStatusMessage("繝励Ξ繧､荳ｭ縺ｮ蜿ょ刈閠・′縺・∪縺帙ｓ縲・, "error");
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
          "隧ｦ蜷育ｵゆｺ・ｒ蜿肴丐縺励∪縺励◆縲ょｾ・ｩ溘′縺・↑縺・◆繧√・繝ｬ繧､荳ｭ縺ｯ縺昴・縺ｾ縺ｾ縺ｧ縺吶・,
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
          `隧ｦ蜷育ｵゆｺ・ｒ蜿肴丐縺励∪縺励◆縲・{removableCount} 莠ｺ繧貞・繧梧崛縺医∪縺励◆縲Ａ,
          "success"
        );
      } else {
        setStatusMessage(
          "隧ｦ蜷育ｵゆｺ・ｒ蜿肴丐縺励∪縺励◆縲ゆｸ企剞蛻ｰ驕碑・・縺・∪縺帙ｓ縺ｧ縺励◆縲・,
          "success"
        );
      }
    } catch (error) {
      console.error(error);
      setStatusMessage("隧ｦ蜷育ｵゆｺ・・逅・↓螟ｱ謨励＠縺ｾ縺励◆縲・, "error");
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
      setStatusMessage(`${playerName} 繧偵・繝ｬ繧､荳ｭ縺九ｉ螟悶＠縺ｾ縺励◆縲Ａ, "success");
    } catch (error) {
      console.error(error);
      setStatusMessage("繝励Ξ繧､荳ｭ縺九ｉ縺ｮ蜑企勁縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲・, "error");
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
      setStatusMessage(`${playerName} 繧貞ｾ・ｩ溷・縺ｮ譛蠕悟ｰｾ縺ｫ謌ｻ縺励∪縺励◆縲Ａ, "success");
    } catch (error) {
      console.error(error);
      setStatusMessage("譛蠕悟ｰｾ縺ｸ謌ｻ縺吝・逅・↓螟ｱ謨励＠縺ｾ縺励◆縲・, "error");
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
        `${playerName} 縺ｮ驟堺ｿ｡騾夂ｮ励ｒ ${currentBattles + 1} 謌ｦ縺ｫ譖ｴ譁ｰ縺励∪縺励◆縲Ａ,
        "success"
      );
    } catch (error) {
      console.error(error);
      setStatusMessage("蟇ｾ謌ｦ謨ｰ縺ｮ譖ｴ譁ｰ縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲・, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const incrementAllActivePlayers = async () => {
    if (!isHost || isProcessing) return;

    if (activePlayers.length === 0) {
      setStatusMessage("繝励Ξ繧､荳ｭ縺ｮ蜿ょ刈閠・′縺・∪縺帙ｓ縲・, "error");
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
      setStatusMessage("繝励Ξ繧､荳ｭ縺ｮ蜈ｨ蜩｡繧・+1謌ｦ 縺励∪縺励◆縲・, "success");
    } catch (error) {
      console.error(error);
      setStatusMessage("蜈ｨ蜩｡縺ｮ蟇ｾ謌ｦ謨ｰ譖ｴ譁ｰ縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲・, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const deleteQueueUser = async (queueId: string, queueName: string) => {
    if (!isHost || isProcessing) return;

    setIsProcessing(true);

    try {
      await deleteDoc(doc(db, "queue", queueId));
      setStatusMessage(`${queueName} 繧貞ｾ・ｩ溷・縺九ｉ蜑企勁縺励∪縺励◆縲Ａ, "success");
    } catch (error) {
      console.error(error);
      setStatusMessage("蠕・ｩ溷・縺九ｉ縺ｮ蜑企勁縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲・, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const resetQueue = async () => {
    if (!isHost || isProcessing) return;

    if (queue.length === 0) {
      setStatusMessage("蠕・ｩ溷・縺ｯ遨ｺ縺ｧ縺吶・, "info");
      return;
    }

    setIsProcessing(true);

    try {
      const batch = writeBatch(db);

      queue.forEach((user) => {
        batch.delete(doc(db, "queue", user.id));
      });

      await batch.commit();
      setStatusMessage("蠕・ｩ溷・繧貞・蜑企勁縺励∪縺励◆縲・, "success");
    } catch (error) {
      console.error(error);
      setStatusMessage("蠕・ｩ溷・縺ｮ繝ｪ繧ｻ繝・ヨ縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲・, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const clearActivePlayers = async () => {
    if (!isHost || isProcessing) return;

    if (activePlayers.length === 0) {
      setStatusMessage("繝励Ξ繧､荳ｭ縺ｮ蜿ょ刈閠・・縺・∪縺帙ｓ縲・, "info");
      return;
    }

    setIsProcessing(true);

    try {
      await syncActivePlayers([]);
      setStatusMessage("繝励Ξ繧､荳ｭ縺ｮ蜿ょ刈閠・ｒ蜈ｨ繧ｯ繝ｪ繧｢縺励∪縺励◆縲・, "success");
    } catch (error) {
      console.error(error);
      setStatusMessage("繝励Ξ繧､荳ｭ縺ｮ繧ｯ繝ｪ繧｢縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲・, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const fullReset = async () => {
    if (!isHost || isProcessing) return;

    if (queue.length === 0 && activePlayers.length === 0) {
      setStatusMessage("縺吶〒縺ｫ遨ｺ縺ｮ迥ｶ諷九〒縺吶・, "info");
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
      setStatusMessage("蜈ｨ繝ｪ繧ｻ繝・ヨ縺励∪縺励◆縲・, "success");
    } catch (error) {
      console.error(error);
      setStatusMessage("蜈ｨ繝ｪ繧ｻ繝・ヨ縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲・, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const activeStatusText = useMemo(() => {
    return `${activePlayers.length} / ${settings.maxActivePlayers} 莠ｺ`;
  }, [activePlayers.length, settings.maxActivePlayers]);
  const planLimit = PLAN_LIMITS[subscription.plan];
  const canUsePriority = subscription.plan !== "free";

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

      setStatusMessage(`繝励Λ繝ｳ繧・${PLAN_LIMITS[plan].label} 縺ｫ螟画峩縺励∪縺励◆縲Ａ, "success");
    } catch (error) {
      console.error(error);
      setStatusMessage("繝励Λ繝ｳ螟画峩縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲・, "error");
    } finally {
      setIsSavingPlan(false);
    }
  };

  const savePricing = async () => {
    if (!isHost || isSavingPricing) return;

    const proMonthlyYen = Number(pricingInput.proMonthlyYen);
    const businessMonthlyYen = Number(pricingInput.businessMonthlyYen);

    if (!Number.isInteger(proMonthlyYen) || proMonthlyYen <= 0) {
      setStatusMessage("Pro萓｡譬ｼ縺ｯ 1 莉･荳翫・謨ｴ謨ｰ縺ｧ蜈･蜉帙＠縺ｦ縺上□縺輔＞縲・, "error");
      return;
    }
    if (!Number.isInteger(businessMonthlyYen) || businessMonthlyYen <= 0) {
      setStatusMessage("Business萓｡譬ｼ縺ｯ 1 莉･荳翫・謨ｴ謨ｰ縺ｧ蜈･蜉帙＠縺ｦ縺上□縺輔＞縲・, "error");
      return;
    }

    setIsSavingPricing(true);
    try {
      await setDoc(
        doc(db, "config", "subscriptionPricing"),
        { proMonthlyYen, businessMonthlyYen, updatedAt: Date.now() },
        { merge: true }
      );
      setStatusMessage("譁咎≡險ｭ螳壹ｒ菫晏ｭ倥＠縺ｾ縺励◆縲・, "success");
    } catch (error) {
      console.error(error);
      setStatusMessage("譁咎≡險ｭ螳壹・菫晏ｭ倥↓螟ｱ謨励＠縺ｾ縺励◆縲・, "error");
    } finally {
      setIsSavingPricing(false);
    }
  };

  const saveOverlayTheme = async () => {
    if (!isHost || isSavingOverlayTheme) return;
    if (subscription.plan === "free") {
      setStatusMessage("OBS繧ｫ繝ｼ繝芽牡螟画峩縺ｯ譛画侭繝励Λ繝ｳ・・ro莉･荳奇ｼ峨〒蛻ｩ逕ｨ縺ｧ縺阪∪縺吶・, "error");
      return;
    }

    if (!overlayTheme.cardBackground.trim() || !overlayTheme.cardText.trim()) {
      setStatusMessage("OBS繧ｫ繝ｩ繝ｼ縺ｯ譛ｪ蜈･蜉帙↓縺ｧ縺阪∪縺帙ｓ縲・, "error");
      return;
    }

    setIsSavingOverlayTheme(true);
    try {
      await setDoc(
        doc(db, "config", "overlayTheme"),
        { ...overlayTheme, updatedAt: Date.now() },
        { merge: true }
      );
      setStatusMessage("OBS繧ｫ繝ｼ繝芽牡繧剃ｿ晏ｭ倥＠縺ｾ縺励◆縲・, "success");
    } catch (error) {
      console.error(error);
      setStatusMessage("OBS繧ｫ繝ｼ繝芽牡縺ｮ菫晏ｭ倥↓螟ｱ謨励＠縺ｾ縺励◆縲・, "error");
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
            `雉ｼ蜈･繝励Λ繝ｳ(${PLAN_LIMITS[purchasedPlan].label})繧定・蜍募渚譏縺励∪縺励◆縲Ａ,
            "success"
          );
        } catch (error) {
          console.error(error);
          setStatusMessage("雉ｼ蜈･繝励Λ繝ｳ縺ｮ閾ｪ蜍募渚譏縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲・, "error");
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
            Firebase險ｭ螳壹′譛ｪ螳御ｺ・〒縺・
          </h1>
          <p style={{ color: "#475569", lineHeight: 1.8, margin: 0 }}>
            `.env.local` 縺ｫ Firebase 縺ｮ蜈ｬ髢九く繝ｼ繧定ｨｭ螳壹☆繧九→ host 逕ｻ髱｢縺御ｽｿ縺医ｋ繧医≧縺ｫ縺ｪ繧翫∪縺吶・
            README 縺ｮ縲悟・蝗槭そ繝・ヨ繧｢繝・・縲阪ｒ荳翫°繧蛾・↓騾ｲ繧√※縺上□縺輔＞縲・
            {firebaseClientInitError ? (
              <>
                <br />
                蛻晄悄蛹悶お繝ｩ繝ｼ: {firebaseClientInitError}
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
            驟堺ｿ｡閠・畑逕ｻ髱｢縺ｧ縺吶・oogle繝ｭ繧ｰ繧､繝ｳ縺励※縺上□縺輔＞縲・
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
            Google縺ｧ繝ｭ繧ｰ繧､繝ｳ
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
            讓ｩ髯舌′縺ゅｊ縺ｾ縺帙ｓ
          </h1>

          <p
            style={{
              color: "#475569",
              lineHeight: 1.7,
              marginTop: 0,
              marginBottom: 16,
            }}
          >
            縺薙・繧｢繧ｫ繧ｦ繝ｳ繝医〒縺ｯ host 逕ｻ髱｢繧貞茜逕ｨ縺ｧ縺阪∪縺帙ｓ縲・
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
            繝ｭ繧ｰ繧｢繧ｦ繝・
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
            {isSettingsOpen ? "險ｭ螳壹ｒ髢峨§繧・ : "險ｭ螳壹ｒ髢九￥"}
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
              繝ｭ繧ｰ繧､繝ｳ荳ｭ: {user.email ?? user.uid}
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
            繝ｭ繧ｰ繧｢繧ｦ繝・
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
            險ｭ螳夂判髱｢繧帝幕縺・※繝励Λ繝ｳ繝ｻ譁咎≡繧貞､画峩縺ｧ縺阪∪縺・
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
            {isSettingsOpen ? "險ｭ螳壹ｒ髢峨§繧・ : "險ｭ螳壹ｒ髢九￥"}
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
              {queue.length}莠ｺ
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
              蜷梧凾蜿ょ刈莠ｺ謨ｰ: {settings.maxActivePlayers}莠ｺ
              <br />
              譛螟ｧ蟇ｾ謌ｦ謨ｰ: {settings.maxBattlesPerPlayer}謌ｦ
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
            險ｭ螳壼､画峩
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
            <div style={{ fontWeight: "bold", marginBottom: 8 }}>繝励Λ繝ｳ</div>
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
              迴ｾ蝨ｨ繝励Λ繝ｳ: {PLAN_LIMITS[subscription.plan].label} / 蜷梧凾蜿ょ刈荳企剞:{" "}
              {planLimit.maxActivePlayers} 莠ｺ
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
            <div style={{ fontWeight: "bold", marginBottom: 8 }}>繝励Λ繝ｳ譁咎≡</div>
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
                placeholder="Pro 譛磯｡・蜀・"
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
                placeholder="Business 譛磯｡・蜀・"
                style={inputStyle}
              />
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
              迴ｾ蝨ｨ蛟､: Pro ﾂ･{pricing.proMonthlyYen.toLocaleString()} / Business ﾂ･
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
              {isSavingPricing ? "菫晏ｭ倅ｸｭ..." : "譁咎≡繧剃ｿ晏ｭ・}
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
              OBS繧ｫ繝ｼ繝芽牡・・ro / Business・・
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
                placeholder="繧ｫ繝ｼ繝芽レ譎ｯ濶ｲ (萓・ rgba(30,41,59,0.62))"
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
                placeholder="繧ｫ繝ｼ繝画枚蟄苓牡 (萓・ #ffffff)"
                style={inputStyle}
                disabled={subscription.plan === "free"}
              />
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
              Free繝励Λ繝ｳ縺ｧ縺ｯ邱ｨ髮・ｸ榊庄縺ｧ縺吶ら樟蝨ｨ蛟､: 閭梧勹 {overlayTheme.cardBackground} / 譁・ｭ養" "}
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
              {isSavingOverlayTheme ? "菫晏ｭ倅ｸｭ..." : "OBS繧ｫ繝ｩ繝ｼ繧剃ｿ晏ｭ・}
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
                蜷梧凾蜿ょ刈莠ｺ謨ｰ
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
                1莠ｺ縺ゅ◆繧頑怙螟ｧ蟇ｾ謌ｦ謨ｰ
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
            {isSavingSettings ? "菫晏ｭ倅ｸｭ..." : "險ｭ螳壹ｒ菫晏ｭ・}
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
                繝励Ξ繧､荳ｭ
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
                  谺｡縺ｮ莠ｺ繧定ｿｽ蜉
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
                  隧ｦ蜷育ｵゆｺ・
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
                迴ｾ蝨ｨ繝励Ξ繧､荳ｭ縺ｮ蜿ょ刈閠・・縺・∪縺帙ｓ縲・
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
                        莉雁屓 {currentSessionBattles}謌ｦ / 驟堺ｿ｡騾夂ｮ・{totalBattles}謌ｦ
                        <br />
                        谺｡縺ｯ {nextSessionBattle}謌ｦ逶ｮ (蜷郁ｨ・{nextTotalBattle}謌ｦ逶ｮ)
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
                          +1謌ｦ
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
                          譛蠕悟ｰｾ縺ｸ謌ｻ縺・
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
                          繧ｯ繝ｪ繧｢
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
              隧ｦ蜷育ｵゆｺ・・繧ｿ繝ｳ:
              <br />
              繝ｻ繝励Ξ繧､荳ｭ蜈ｨ蜩｡繧・+1謌ｦ
              <br />
              繝ｻ蠕・ｩ溘′縺・ｋ蝣ｴ蜷医・縺ｿ縲∽ｸ企剞蛻ｰ驕碑・ｒ閾ｪ蜍輔〒蜈･繧梧崛縺・
              <br />
              繝ｻ蜷梧凾縺ｫ荳企剞蛻ｰ驕斐＠縺溘→縺阪・縲∝・縺ｫ蜿ょ刈縺励◆莠ｺ縺九ｉ蜆ｪ蜈育噪縺ｫ莠､莉｣
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
                繝励Ξ繧､荳ｭ蜈ｨ蜩｡繧・1謌ｦ
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
                繝励Ξ繧､荳ｭ繧貞・繧ｯ繝ｪ繧｢
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
              蠕・ｩ溘Μ繧ｹ繝・
            </div>

            {queue.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  color: "#64748b",
                }}
              >
                蠕・ｩ滉ｸｭ縺ｮ蜿ょ刈閠・・縺・∪縺帙ｓ縲・
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
                      {index + 1}・嘴user.name}
                      {user.entryType === "priority" && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 11,
                            padding: "3px 7px",
                            borderRadius: 9999,
                            backgroundColor: "#fef3c7",
                            color: "#92400e",
                          }}
                        >
                          PRIORITY
                        </span>
                      )}
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
                      蜑企勁
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
                蠕・ｩ溷・繧貞・蜑企勁
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
                蜈ｨ繝ｪ繧ｻ繝・ヨ
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

