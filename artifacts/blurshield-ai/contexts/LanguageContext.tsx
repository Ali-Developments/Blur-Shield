import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import dict from '@/constants/translations';
import type { Language } from '@/constants/translations';

export type { Language };

const STORAGE_KEY = '@blurshield/language';

function getPath(obj: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined,
      obj,
    );
}

interface LanguageContextValue {
  language: Language;
  isRTL: boolean;
  isReady: boolean;
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored === 'ar' || stored === 'en') {
          setLanguageState(stored);
        }
      } finally {
        setIsReady(true);
      }
    })();
  }, []);

  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
    await AsyncStorage.setItem(STORAGE_KEY, lang);
  };

  const t = useMemo(() => {
    const table: unknown = dict[language];
    return (key: string) => {
      const value = getPath(table, key);
      if (typeof value === 'string') return value;
      const fallback = getPath(dict.en, key);
      return typeof fallback === 'string' ? fallback : key;
    };
  }, [language]);

  const value: LanguageContextValue = {
    language,
    isRTL: language === 'ar',
    isReady,
    setLanguage,
    t,
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
