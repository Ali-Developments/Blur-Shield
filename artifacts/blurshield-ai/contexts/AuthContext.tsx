import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCOUNTS_KEY = '@blurshield/accounts';
const SESSION_KEY = '@blurshield/session_email';
const PENDING_BONUS_KEY = '@blurshield/pending_bonus';

export type AuthProvider = 'email' | 'google' | 'apple';

export interface AppUser {
  id: string;
  name: string;
  email: string;
  provider: AuthProvider;
  createdAt: string;
  referralCode: string;
}

interface StoredAccount extends AppUser {
  password: string;
}

type Accounts = Record<string, StoredAccount>;

function genId() {
  return Date.now().toString() + Math.random().toString(36).slice(2, 9);
}

function makeReferralCode(name: string) {
  const base = name.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase() || 'BLUR';
  return `${base}${Math.floor(1000 + Math.random() * 9000)}`;
}

async function readAccounts(): Promise<Accounts> {
  const raw = await AsyncStorage.getItem(ACCOUNTS_KEY);
  return raw ? (JSON.parse(raw) as Accounts) : {};
}

async function writeAccounts(accounts: Accounts) {
  await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

interface AuthContextValue {
  user: AppUser | null;
  isReady: boolean;
  error: string | null;
  clearError: () => void;
  register: (name: string, email: string, password: string) => Promise<boolean>;
  login: (email: string, password: string) => Promise<boolean>;
  loginWithProvider: (provider: 'google' | 'apple') => Promise<void>;
  logout: () => Promise<void>;
  findAccount: (email: string) => Promise<boolean>;
  resetPassword: (email: string, newPassword: string) => Promise<boolean>;
  consumePendingBonus: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const sessionEmail = await AsyncStorage.getItem(SESSION_KEY);
        if (sessionEmail) {
          const accounts = await readAccounts();
          const account = accounts[sessionEmail.toLowerCase()];
          if (account) {
            const { password: _password, ...rest } = account;
            setUser(rest);
          }
        }
      } finally {
        setIsReady(true);
      }
    })();
  }, []);

  const clearError = () => setError(null);

  const register = async (name: string, email: string, password: string) => {
    setError(null);
    const key = email.trim().toLowerCase();
    if (!name.trim() || !key || password.length < 6) {
      setError('validation');
      return false;
    }
    const accounts = await readAccounts();
    if (accounts[key]) {
      setError('exists');
      return false;
    }
    const newUser: StoredAccount = {
      id: genId(),
      name: name.trim(),
      email: key,
      provider: 'email',
      createdAt: new Date().toISOString(),
      referralCode: makeReferralCode(name),
      password,
    };
    accounts[key] = newUser;
    await writeAccounts(accounts);
    await AsyncStorage.setItem(SESSION_KEY, key);
    await AsyncStorage.setItem(PENDING_BONUS_KEY, '1');
    const { password: _password, ...rest } = newUser;
    setUser(rest);
    return true;
  };

  const login = async (email: string, password: string) => {
    setError(null);
    const key = email.trim().toLowerCase();
    const accounts = await readAccounts();
    const account = accounts[key];
    if (!account || account.password !== password) {
      setError('invalid');
      return false;
    }
    await AsyncStorage.setItem(SESSION_KEY, key);
    const { password: _password, ...rest } = account;
    setUser(rest);
    return true;
  };

  const loginWithProvider = async (provider: 'google' | 'apple') => {
    setError(null);
    const key = `${provider}-demo@blurshield.app`;
    const accounts = await readAccounts();
    let account = accounts[key];
    let isNew = false;
    if (!account) {
      isNew = true;
      account = {
        id: genId(),
        name: provider === 'google' ? 'Google User' : 'Apple User',
        email: key,
        provider,
        createdAt: new Date().toISOString(),
        referralCode: makeReferralCode(provider),
        password: genId(),
      };
      accounts[key] = account;
      await writeAccounts(accounts);
    }
    await AsyncStorage.setItem(SESSION_KEY, key);
    if (isNew) await AsyncStorage.setItem(PENDING_BONUS_KEY, '1');
    const { password: _password, ...rest } = account;
    setUser(rest);
  };

  const logout = async () => {
    await AsyncStorage.removeItem(SESSION_KEY);
    setUser(null);
  };

  const findAccount = async (email: string) => {
    const accounts = await readAccounts();
    return Boolean(accounts[email.trim().toLowerCase()]);
  };

  const resetPassword = async (email: string, newPassword: string) => {
    const key = email.trim().toLowerCase();
    const accounts = await readAccounts();
    const account = accounts[key];
    if (!account || newPassword.length < 6) return false;
    account.password = newPassword;
    accounts[key] = account;
    await writeAccounts(accounts);
    return true;
  };

  const consumePendingBonus = async () => {
    const pending = await AsyncStorage.getItem(PENDING_BONUS_KEY);
    if (pending === '1') {
      await AsyncStorage.removeItem(PENDING_BONUS_KEY);
      return true;
    }
    return false;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isReady,
        error,
        clearError,
        register,
        login,
        loginWithProvider,
        logout,
        findAccount,
        resetPassword,
        consumePendingBonus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
