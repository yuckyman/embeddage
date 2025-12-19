import type {
  CollectiveGuessEntry,
  LeaderboardEntry,
  PlayerProfile,
  SyncResponse,
} from "./types.ts";

const PLAYER_STORAGE_KEY = "embeddage_player_id";
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";

export function getStoredPlayerId(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(PLAYER_STORAGE_KEY);
}

export function persistPlayerId(playerId: string) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(PLAYER_STORAGE_KEY, playerId);
}

export async function ensurePlayer(nickname?: string): Promise<PlayerProfile> {
  const existing = getStoredPlayerId();
  if (existing) return { playerId: existing, nickname: null };

  const res = await fetch(`${API_BASE}/player/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname }),
  });

  if (!res.ok) throw new Error(`register failed: ${res.status}`);
  const data = (await res.json()) as { player_id: string; nickname?: string | null };
  persistPlayerId(data.player_id);
  return { playerId: data.player_id, nickname: data.nickname ?? null };
}

export async function updateNickname(
  playerId: string,
  nickname: string | null,
): Promise<PlayerProfile> {
  const res = await fetch(`${API_BASE}/player/nickname`, {
    method: "PUT",
    headers: buildHeaders(playerId),
    body: JSON.stringify({ nickname }),
  });

  if (res.status === 429) {
    throw new RateLimitError("rate limit exceeded");
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`nickname update failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { player_id: string; nickname?: string | null };
  if (data.player_id) persistPlayerId(data.player_id);
  return { playerId: data.player_id, nickname: data.nickname ?? null };
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

export async function syncGameState(
  playerId: string,
  payload: { date: string; bestRank: number | null; guessCount: number; finished: boolean },
): Promise<SyncResponse> {
  const res = await fetch(`${API_BASE}/game-state`, {
    method: "PUT",
    headers: buildHeaders(playerId),
    body: JSON.stringify({
      date: payload.date,
      bestRank: payload.bestRank,
      guessCount: payload.guessCount,
      finished: payload.finished,
    }),
  });

  if (res.status === 429) {
    throw new RateLimitError("rate limit exceeded");
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`sync failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as SyncResponse;
  if (data.player_id) persistPlayerId(data.player_id);
  return data;
}

export async function fetchLeaderboard(date: string, limit = 25): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${API_BASE}/leaderboard?date=${encodeURIComponent(date)}&limit=${limit}`);
  if (!res.ok) throw new Error(`leaderboard failed: ${res.status}`);
  const data = (await res.json()) as { leaderboard: LeaderboardEntry[] };
  return data.leaderboard;
}

function buildHeaders(playerId: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${playerId}`,
  };
}

export async function publishCollectiveGuess(
  playerId: string,
  payload: { date: string; word: string; rank: number | null; score: number | null },
): Promise<void> {
  const res = await fetch(`${API_BASE}/collective/guess`, {
    method: "POST",
    headers: buildHeaders(playerId),
    body: JSON.stringify(payload),
  });

  if (res.status === 429) {
    throw new RateLimitError("rate limit exceeded");
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`collective publish failed: ${res.status} ${text}`);
  }
}

export async function fetchCollectiveGuesses(
  date: string,
  limit = 50,
): Promise<CollectiveGuessEntry[]> {
  const res = await fetch(
    `${API_BASE}/collective?date=${encodeURIComponent(date)}&limit=${limit}`,
  );
  if (res.status === 429) {
    throw new RateLimitError("rate limit exceeded");
  }
  if (!res.ok) throw new Error(`collective fetch failed: ${res.status}`);
  const data = (await res.json()) as { guesses: CollectiveGuessEntry[] };
  return data.guesses;
}
