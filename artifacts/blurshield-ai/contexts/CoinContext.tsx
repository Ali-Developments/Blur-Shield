import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';

const BALANCE_KEY = '@blurshield/coins_balance';
const HISTORY_KEY = '@blurshield/coins_history';
const ADS_COUNT_KEY = '@blurshield/ads_watched_count';
const ADS_DATE_KEY = '@blurshield/ads_watched_date';

export const SIGNUP_BONUS = 350;
export const MAX_ADS_PER_DAY = 10;
export const AD_BASE_REWARD = 25;

export type CoinTxType = 'bonus' | 'earn' | 'spend';

export interface CoinTx {
  id: string;
  type: CoinTxType;
  amount: number;
  label: string;
  date: string;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function genId() {
  return Date.now().toString() + Math.random().toString(36).slice(2, 9);
}

function milestoneBonus(adNumber: number) {
  if (adNumber === 3) return 5; // 3 ads => 75 base + 5 = 80
  if (adNumber === 5) return 25; // 5 ads => 125 base + 25 = 150
  return 0;
}

interface CoinContextValue {
  balance: number;
  history: CoinTx[];
  adsWatchedToday: number;
  maxAdsPerDay: number;
  isWatchingAd: boolean;
  lastReward: { amount: number; adNumber: number } | null;
  watchAd: () => Promise<{ amount: number; adNumber: number } | null>;
  dismissReward: () => void;
}

const CoinContext = createContext<CoinContextValue | undefined>(undefined);

export function CoinProvider({ children }: { children: React.ReactNode }) {
  const { user, consumePendingBonus } = useAuth();
  const [balance, setBalance] = useState(0);
  const [history, setHistory] = useState<CoinTx[]>([]);
  const [adsWatchedToday, setAdsWatchedToday] = useState(0);
  const [isWatchingAd, setIsWatchingAd] = useState(false);
  const [lastReward, setLastReward] = useState<{ amount: number; adNumber: number } | null>(
    null,
  );
  const lockRef = useRef(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!user || loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      const [storedBalance, storedHistory, storedCount, storedDate] = await Promise.all([
        AsyncStorage.getItem(BALANCE_KEY),
        AsyncStorage.getItem(HISTORY_KEY),
        AsyncStorage.getItem(ADS_COUNT_KEY),
        AsyncStorage.getItem(ADS_DATE_KEY),
      ]);

      let currentBalance = storedBalance ? Number(storedBalance) : 0;
      let currentHistory: CoinTx[] = storedHistory ? JSON.parse(storedHistory) : [];

      const gotBonus = await consumePendingBonus();
      if (gotBonus) {
        currentBalance += SIGNUP_BONUS;
        currentHistory = [
          {
            id: genId(),
            type: 'bonus',
            amount: SIGNUP_BONUS,
            label: 'signupBonus',
            date: new Date().toISOString(),
          },
          ...currentHistory,
        ];
        await AsyncStorage.setItem(BALANCE_KEY, String(currentBalance));
        await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(currentHistory));
      }

      setBalance(currentBalance);
      setHistory(currentHistory);

      if (storedDate === today()) {
        setAdsWatchedToday(storedCount ? Number(storedCount) : 0);
      } else {
        setAdsWatchedToday(0);
        await AsyncStorage.setItem(ADS_DATE_KEY, today());
        await AsyncStorage.setItem(ADS_COUNT_KEY, '0');
      }
    })();
  }, [user, consumePendingBonus]);

  useEffect(() => {
    if (!user) {
      loadedRef.current = false;
      setBalance(0);
      setHistory([]);
      setAdsWatchedToday(0);
    }
  }, [user]);

  const watchAd = async () => {
    if (lockRef.current || isWatchingAd) return null;
    if (adsWatchedToday >= MAX_ADS_PER_DAY) return null;
    lockRef.current = true;
    setIsWatchingAd(true);

    await new Promise((resolve) => setTimeout(resolve, 2400));

    const adNumber = adsWatchedToday + 1;
    const reward = AD_BASE_REWARD + milestoneBonus(adNumber);

    const newBalance = balance + reward;
    const label = milestoneBonus(adNumber) > 0 ? 'milestoneBonus' : 'adReward';
    const tx: CoinTx = {
      id: genId(),
      type: 'earn',
      amount: reward,
      label,
      date: new Date().toISOString(),
    };
    const newHistory = [tx, ...history];

    setBalance(newBalance);
    setHistory(newHistory);
    setAdsWatchedToday(adNumber);
    setIsWatchingAd(false);
    setLastReward({ amount: reward, adNumber });
    lockRef.current = false;

    await Promise.all([
      AsyncStorage.setItem(BALANCE_KEY, String(newBalance)),
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory)),
      AsyncStorage.setItem(ADS_COUNT_KEY, String(adNumber)),
      AsyncStorage.setItem(ADS_DATE_KEY, today()),
    ]);

    return { amount: reward, adNumber };
  };

  const dismissReward = () => setLastReward(null);

  return (
    <CoinContext.Provider
      value={{
        balance,
        history,
        adsWatchedToday,
        maxAdsPerDay: MAX_ADS_PER_DAY,
        isWatchingAd,
        lastReward,
        watchAd,
        dismissReward,
      }}
    >
      {children}
    </CoinContext.Provider>
  );
}

export function useCoins() {
  const ctx = useContext(CoinContext);
  if (!ctx) throw new Error('useCoins must be used within CoinProvider');
  return ctx;
}
