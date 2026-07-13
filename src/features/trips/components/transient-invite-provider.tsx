"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type TransientInviteContextValue = {
  getInviteToken: (roomId: string) => string | null;
  rememberInviteToken: (roomId: string, token: string) => void;
};

const TransientInviteContext =
  createContext<TransientInviteContextValue | null>(null);

export function TransientInviteProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const rememberInviteToken = useCallback((roomId: string, token: string) => {
    setTokens((current) => ({ ...current, [roomId]: token }));
  }, []);
  const getInviteToken = useCallback(
    (roomId: string) => tokens[roomId] ?? null,
    [tokens],
  );
  const value = useMemo(
    () => ({ getInviteToken, rememberInviteToken }),
    [getInviteToken, rememberInviteToken],
  );

  return (
    <TransientInviteContext.Provider value={value}>
      {children}
    </TransientInviteContext.Provider>
  );
}

export function useTransientInvite() {
  const context = useContext(TransientInviteContext);
  if (!context) {
    throw new Error("useTransientInvite must be used within its provider.");
  }
  return context;
}
