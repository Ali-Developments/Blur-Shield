import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import colors from '@/constants/colors';

const STORAGE_KEY = '@blurshield/theme';

export type ThemeMode = 'light' | 'dark' | 'system';
type Palette = typeof colors.light;

interface ThemeContextValue {
  themeMode: ThemeMode;
  resolvedScheme: 'light' | 'dark';
  colors: Palette & { radius: number };
  setThemeMode: (mode: ThemeMode) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>('dark');
  const [systemScheme, setSystemScheme] = useState<'light' | 'dark'>(
    Appearance.getColorScheme() === 'dark' ? 'dark' : 'light',
  );

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setThemeModeState(stored);
      }
    })();
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme === 'dark' ? 'dark' : 'light');
    });
    return () => sub.remove();
  }, []);

  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    await AsyncStorage.setItem(STORAGE_KEY, mode);
  };

  const resolvedScheme: 'light' | 'dark' =
    themeMode === 'system' ? systemScheme : themeMode;

  const value = useMemo<ThemeContextValue>(() => {
    const palette = resolvedScheme === 'dark' ? colors.dark : colors.light;
    return {
      themeMode,
      resolvedScheme,
      colors: { ...palette, radius: colors.radius },
      setThemeMode,
    };
  }, [themeMode, resolvedScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

/** Convenience hook mirroring the scaffold's original useColors() signature. */
export function useColors() {
  return useTheme().colors;
}
