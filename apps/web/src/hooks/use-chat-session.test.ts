import "../test-setup";
import { beforeEach, describe, expect, it } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import {
  useChatSession,
  CHAT_SESSION_STORAGE_KEY,
  CHAT_SESSION_EXPIRY_MS,
  getStoredSession,
  saveSession,
  clearSession,
} from "./use-chat-session";

describe("useChatSession hook", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("generates a new UUID v4 and persists in localStorage when none exists", () => {
    const { result } = renderHook(() => useChatSession());

    expect(result.current.sessionId).toBeDefined();
    expect(result.current.sessionId.length).toBeGreaterThan(10);

    const stored = getStoredSession();
    expect(stored).not.toBeNull();
    expect(stored?.sessionId).toBe(result.current.sessionId);
    expect(stored?.lastActiveAt).toBeGreaterThan(0);
  });

  it("reuses existing sessionId if within the 1 hour expiration window", () => {
    const existingId = "existing-uuid-1234";
    const recentTimestamp = Date.now() - 1000 * 60 * 30; // 30 minutes ago

    saveSession({ sessionId: existingId, lastActiveAt: recentTimestamp });

    const { result } = renderHook(() => useChatSession());

    expect(result.current.sessionId).toBe(existingId);
    // Should have updated lastActiveAt to now
    const stored = getStoredSession();
    expect(stored?.sessionId).toBe(existingId);
    expect(stored?.lastActiveAt).toBeGreaterThan(recentTimestamp);
  });

  it("discards expired session (> 1 hour) and generates a new sessionId", () => {
    const expiredId = "expired-uuid-9999";
    const expiredTimestamp = Date.now() - (CHAT_SESSION_EXPIRY_MS + 1000); // 1 hour and 1 second ago

    saveSession({ sessionId: expiredId, lastActiveAt: expiredTimestamp });

    const { result } = renderHook(() => useChatSession());

    expect(result.current.sessionId).not.toBe(expiredId);
    const stored = getStoredSession();
    expect(stored?.sessionId).toBe(result.current.sessionId);
  });

  it("handles corrupted JSON in localStorage gracefully by generating a new session", () => {
    localStorage.setItem(CHAT_SESSION_STORAGE_KEY, "invalid-json{");

    const { result } = renderHook(() => useChatSession());

    expect(result.current.sessionId).toBeDefined();
    const stored = getStoredSession();
    expect(stored?.sessionId).toBe(result.current.sessionId);
  });

  it("updates lastActiveAt when touchSession is called", () => {
    const { result } = renderHook(() => useChatSession());
    const initialSession = getStoredSession();
    const initialTime = initialSession!.lastActiveAt;

    act(() => {
      // Simulate small time progression
      result.current.touchSession();
    });

    const updatedSession = getStoredSession();
    expect(updatedSession?.sessionId).toBe(result.current.sessionId);
    expect(updatedSession?.lastActiveAt).toBeGreaterThanOrEqual(initialTime);
  });

  it("resets session with a new UUID when resetSession is called", () => {
    const { result } = renderHook(() => useChatSession());
    const firstId = result.current.sessionId;

    act(() => {
      const newId = result.current.resetSession();
      expect(newId).not.toBe(firstId);
    });

    expect(result.current.sessionId).not.toBe(firstId);
    const stored = getStoredSession();
    expect(stored?.sessionId).toBe(result.current.sessionId);
  });

  it("clearSession removes data from localStorage", () => {
    saveSession({ sessionId: "test", lastActiveAt: Date.now() });
    expect(localStorage.getItem(CHAT_SESSION_STORAGE_KEY)).not.toBeNull();

    clearSession();
    expect(localStorage.getItem(CHAT_SESSION_STORAGE_KEY)).toBeNull();
  });

  it("touchSession generates a new session if expired while tab remained open", () => {
    const { result } = renderHook(() => useChatSession());
    const initialId = result.current.sessionId;

    // Simulate expiration in storage
    const expiredTimestamp = Date.now() - (CHAT_SESSION_EXPIRY_MS + 5000);
    saveSession({ sessionId: initialId, lastActiveAt: expiredTimestamp });

    act(() => {
      result.current.touchSession();
    });

    expect(result.current.sessionId).not.toBe(initialId);
    const stored = getStoredSession();
    expect(stored?.sessionId).toBe(result.current.sessionId);
  });

  it("synchronizes session when storage event is received from another tab", () => {
    const { result } = renderHook(() => useChatSession());
    const otherTabSessionId = "other-tab-uuid-8888";

    act(() => {
      saveSession({
        sessionId: otherTabSessionId,
        lastActiveAt: Date.now(),
      });
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: CHAT_SESSION_STORAGE_KEY,
        })
      );
    });

    expect(result.current.sessionId).toBe(otherTabSessionId);
  });
});
