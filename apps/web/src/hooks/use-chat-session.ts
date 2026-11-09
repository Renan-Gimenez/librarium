import * as React from "react";

export const CHAT_SESSION_STORAGE_KEY = "librarium_chat_session";
export const CHAT_SESSION_EXPIRY_MS = 60 * 60 * 1000; // 1 hora (3600 segundos)

export interface ChatSessionData {
  sessionId: string;
  lastActiveAt: number;
}

export function generateUUID(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  // Fallback RFC4122 v4 UUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getStoredSession(now = Date.now()): ChatSessionData | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(CHAT_SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<ChatSessionData>;
    if (
      typeof parsed.sessionId === "string" &&
      parsed.sessionId.trim().length > 0 &&
      typeof parsed.lastActiveAt === "number" &&
      Number.isFinite(parsed.lastActiveAt)
    ) {
      const isExpired = now - parsed.lastActiveAt > CHAT_SESSION_EXPIRY_MS;
      if (!isExpired) {
        return {
          sessionId: parsed.sessionId.trim(),
          lastActiveAt: parsed.lastActiveAt,
        };
      }
    }
  } catch {
    // Corrupted data, ignore and return null
  }

  return null;
}

export function saveSession(data: ChatSessionData): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(
      CHAT_SESSION_STORAGE_KEY,
      JSON.stringify(data)
    );
  } catch {
    // Storage might be blocked or full
  }
}

export function clearSession(): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.removeItem(CHAT_SESSION_STORAGE_KEY);
  } catch {
    // Ignore error
  }
}

export interface UseChatSessionReturn {
  sessionId: string;
  touchSession: () => void;
  resetSession: () => string;
}

export function useChatSession(): UseChatSessionReturn {
  const [sessionId, setSessionId] = React.useState<string>(() => {
    const now = Date.now();
    const existing = getStoredSession(now);

    if (existing) {
      // Refresh last active timestamp
      const updated: ChatSessionData = {
        sessionId: existing.sessionId,
        lastActiveAt: now,
      };
      saveSession(updated);
      return existing.sessionId;
    }

    const newId = generateUUID();
    saveSession({ sessionId: newId, lastActiveAt: now });
    return newId;
  });

  const touchSession = React.useCallback(() => {
    const now = Date.now();
    const stored = getStoredSession(now);

    // If session expired while tab was inactive, renew it
    if (!stored) {
      const newId = generateUUID();
      saveSession({ sessionId: newId, lastActiveAt: now });
      setSessionId(newId);
      return;
    }

    if (stored.sessionId !== sessionId) {
      setSessionId(stored.sessionId);
    }

    saveSession({ sessionId: stored.sessionId, lastActiveAt: now });
  }, [sessionId]);

  // Sync across tabs
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.localStorage) return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key === CHAT_SESSION_STORAGE_KEY) {
        const current = getStoredSession();
        if (current && current.sessionId !== sessionId) {
          setSessionId(current.sessionId);
        }
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [sessionId]);

  const resetSession = React.useCallback(() => {
    const now = Date.now();
    const newId = generateUUID();
    saveSession({ sessionId: newId, lastActiveAt: now });
    setSessionId(newId);
    return newId;
  }, []);

  return {
    sessionId,
    touchSession,
    resetSession,
  };
}
