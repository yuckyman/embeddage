/*
 * Api worker for embeddage leaderboard + identity
 */

interface Env {
  LEADERBOARD: KVNamespace;
  PLAYERS: KVNamespace;
  ASSETS: Fetcher;
  ADMIN_TOKEN?: string;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname.startsWith("/api/player/register") && request.method === "POST") {
      return handleRegister(request, env);
    }

    if (pathname.startsWith("/api/player/nickname") && request.method === "PUT") {
      return handleNickname(request, env);
    }

    if (pathname.startsWith("/api/game-state") && request.method === "PUT") {
      return handleGameState(request, env);
    }

    if (pathname.startsWith("/api/leaderboard") && request.method === "GET") {
      return handleLeaderboard(request, env);
    }

    if (pathname.startsWith("/api/collective/guess") && request.method === "POST") {
      return handleCollectiveGuess(request, env);
    }

    if (pathname.startsWith("/api/collective") && request.method === "GET") {
      return handleCollective(request, env);
    }

    if (pathname.startsWith("/api/admin/clear") && request.method === "POST") {
      return handleAdminClear(request, env);
    }
    // fall through to static assets
    return env.ASSETS.fetch(request);
  },
};

type PlayerRecord = {
  playerId: string;
  nickname?: string;
  createdAt: number;
};

type ScoreEntry = {
  playerId: string;
  date: string;
  bestRank: number | null;
  guessCount: number;
  finished: boolean;
  updatedAt: number;
  nickname?: string;
};

type LeaderboardMap = Record<string, ScoreEntry>;

type CollectiveEntry = {
  word: string;
  normalized: string;
  bestRank: number | null;
  bestScore: number | null;
  count: number;
  lastSeenAt: number;
};

type CollectiveMap = Record<string, CollectiveEntry>;
type GameStatePayload = {
  date?: string;
  bestRank?: number | null;
  guessCount?: number;
  finished?: boolean;
};

type CollectivePayload = {
  date?: string;
  word?: string;
  rank?: number | null;
  score?: number | null;
};
async function handleRegister(request: Request, env: Env): Promise<Response> {
  const nickname = await readNickname(request);
  const player = await createPlayer(env, nickname ?? undefined);
  return json({ player_id: player.playerId, nickname: player.nickname }, 201);
}

async function handleNickname(request: Request, env: Env): Promise<Response> {
  const authResult = await authenticate(request, env);
  if (authResult.errorResponse) return authResult.errorResponse;

  const player = authResult.player!;
  const nickname = await readNickname(request);
  const nextNickname = nickname ?? undefined;

  const updatedPlayer: PlayerRecord = { ...player, nickname: nextNickname };
  await env.PLAYERS.put(playerKey(updatedPlayer.playerId), JSON.stringify(updatedPlayer));

  // keep today's leaderboard entry in sync if it exists
  const todayKey = leaderboardKey(getTodayNY());
  const board = await readLeaderboard(env, todayKey);
  if (board[player.playerId]) {
    board[player.playerId] = { ...board[player.playerId], nickname: nextNickname };
    await env.LEADERBOARD.put(todayKey, JSON.stringify(board));
  }

  return json({ player_id: updatedPlayer.playerId, nickname: updatedPlayer.nickname ?? null });
}

async function handleGameState(request: Request, env: Env): Promise<Response> {
  const authResult = await authenticate(request, env);
  if (authResult.errorResponse) return authResult.errorResponse;

  const player = authResult.player!;
  const payload = (await readJson<GameStatePayload>(request)) ?? {};

  const date = payload.date ?? null;
  if (!date) return json({ error: "missing date" }, 400);

  const today = getTodayNY();
  if (date !== today) {
    return json({ error: `date mismatch; expected ${today}` }, 400);
  }

  const bestRank = normalizeRank(payload.bestRank);
  const guessCount = normalizeGuessCount(payload.guessCount);
  const finished = Boolean(payload.finished) || bestRank === 1;

  const boardKey = leaderboardKey(date);
  const boardMap = await readLeaderboard(env, boardKey);
  const prev = boardMap[player.playerId];

  const nextEntry: ScoreEntry = {
    playerId: player.playerId,
    nickname: player.nickname,
    date,
    bestRank: updateBestRank(prev?.bestRank ?? null, bestRank),
    guessCount: updateGuessCount(prev?.guessCount ?? 0, guessCount),
    finished: prev?.finished || finished,
    updatedAt: Date.now(),
  };

  boardMap[player.playerId] = nextEntry;
  await env.LEADERBOARD.put(boardKey, JSON.stringify(boardMap));

  const leaderboard = buildLeaderboard(boardMap, getLimitFromRequest(request));

  return json({
    player_id: player.playerId,
    nickname: player.nickname,
    entry: nextEntry,
    leaderboard,
  });
}

async function handleLeaderboard(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? getTodayNY();
  const limit = getLimitFromRequest(request);

  const boardMap = await readLeaderboard(env, leaderboardKey(date));
  const leaderboard = buildLeaderboard(boardMap, limit);

  return json({ date, leaderboard });
}

async function handleCollectiveGuess(request: Request, env: Env): Promise<Response> {
  const authResult = await authenticate(request, env);
  if (authResult.errorResponse) return authResult.errorResponse;

  const payload = (await readJson<CollectivePayload>(request)) ?? {};
  const date = payload.date ?? null;
  if (!date) return json({ error: "missing date" }, 400);

  const today = getTodayNY();
  if (date !== today) return json({ error: `date mismatch; expected ${today}` }, 400);

  const word = normalizeWord(payload.word);
  if (!word) return json({ error: "missing word" }, 400);

  const bestRank = normalizeRank(payload.rank);
  const bestScore = normalizeScore(payload.score);

  const key = collectiveKey(date);
  const crowdMap = await readCollective(env, key);
  const prev = crowdMap[word];
  const now = Date.now();

  const entry: CollectiveEntry = {
    word,
    normalized: word,
    bestRank: updateBestRank(prev?.bestRank ?? null, bestRank),
    bestScore: updateBestScore(prev?.bestScore ?? null, bestScore),
    count: (prev?.count ?? 0) + 1,
    lastSeenAt: now,
  };

  crowdMap[word] = entry;
  await env.LEADERBOARD.put(key, JSON.stringify(crowdMap));

  const guesses = buildCollectiveList(crowdMap, getLimitFromRequest(request));
  return json({ guesses });
}

async function handleCollective(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? getTodayNY();
  const key = collectiveKey(date);
  const crowdMap = await readCollective(env, key);
  const guesses = buildCollectiveList(crowdMap, getLimitFromRequest(request));
  return json({ guesses });
}

async function handleAdminClear(request: Request, env: Env): Promise<Response> {
  // check admin token
  const authError = checkAdminAuth(request, env);
  if (authError) return authError;

  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? getTodayNY();

  // validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ error: "invalid date format; expected YYYY-MM-DD" }, 400);
  }

  // clear leaderboard for this date
  const lbKey = leaderboardKey(date);
  await env.LEADERBOARD.delete(lbKey);

  // clear collective guesses for this date
  const collKey = collectiveKey(date);
  await env.LEADERBOARD.delete(collKey);

  return json({
    success: true,
    date,
    cleared: {
      leaderboard: true,
      collective: true,
    },
  });
}

function checkAdminAuth(request: Request, env: Env): Response | null {
  const adminToken = env.ADMIN_TOKEN;
  if (!adminToken) {
    return json({ error: "admin functionality not configured" }, 503);
  }

  const header = request.headers.get("Authorization");
  const token = header?.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : null;

  if (!token || token !== adminToken) {
    return json({ error: "unauthorized" }, 401);
  }

  return null;
}

async function authenticate(
  request: Request,
  env: Env,
): Promise<{ player?: PlayerRecord; errorResponse?: Response }> {
  const header = request.headers.get("Authorization");
  const token = header?.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : null;

  const playerId = token && token.length > 0 ? token : null;

  if (!playerId) {
    const player = await createPlayer(env);
    return { player };
  }

  const player = await loadPlayer(env, playerId);
  if (!player) {
    return { errorResponse: json({ error: "invalid player" }, 401) };
  }

  return { player };
}

async function createPlayer(env: Env, nickname?: string): Promise<PlayerRecord> {
  const playerId = crypto.randomUUID();
  const record: PlayerRecord = {
    playerId,
    nickname,
    createdAt: Date.now(),
  };
  await env.PLAYERS.put(playerKey(playerId), JSON.stringify(record));
  return record;
}

async function loadPlayer(env: Env, playerId: string): Promise<PlayerRecord | null> {
  const stored = await env.PLAYERS.get(playerKey(playerId));
  if (!stored) return null;
  return JSON.parse(stored) as PlayerRecord;
}

function playerKey(id: string): string {
  return `player:${id}`;
}

async function readNickname(request: Request): Promise<string | null> {
  try {
    const body = await request.json();
    if (typeof body?.nickname === "string" && body.nickname.trim().length > 0) {
      return body.nickname.trim().slice(0, 64);
    }
    return null;
  } catch {
    return null;
  }
}

async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function normalizeRank(rank: number | null | undefined): number | null {
  if (rank === null || rank === undefined) return null;
  if (typeof rank !== "number" || !Number.isFinite(rank) || rank < 1) return null;
  return Math.floor(rank);
}

function normalizeGuessCount(count: number | undefined): number {
  if (typeof count !== "number" || !Number.isFinite(count) || count < 0) return 0;
  return Math.floor(count);
}

function updateBestRank(previous: number | null, incoming: number | null): number | null {
  if (incoming === null) return previous;
  if (previous === null) return incoming;
  return Math.min(previous, incoming);
}

function updateBestScore(previous: number | null, incoming: number | null): number | null {
  if (incoming === null) return previous;
  if (previous === null) return incoming;
  return Math.max(previous, incoming);
}
function updateGuessCount(previous: number, incoming: number): number {
  return Math.max(previous, incoming);
}

function leaderboardKey(date: string): string {
  return `leaderboard:${date}`;
}

function collectiveKey(date: string): string {
  return `collective:${date}`;
}
async function readLeaderboard(env: Env, key: string): Promise<LeaderboardMap> {
  const stored = await env.LEADERBOARD.get(key);
  if (!stored) return {};
  try {
    return JSON.parse(stored) as LeaderboardMap;
  } catch {
    return {};
  }
}

async function readCollective(env: Env, key: string): Promise<CollectiveMap> {
  const stored = await env.LEADERBOARD.get(key);
  if (!stored) return {};
  try {
    return JSON.parse(stored) as CollectiveMap;
  } catch {
    return {};
  }
}
function buildLeaderboard(map: LeaderboardMap, limit: number): ScoreEntry[] {
  const entries = Object.values(map);
  entries.sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;

    const rankA = a.bestRank ?? Number.POSITIVE_INFINITY;
    const rankB = b.bestRank ?? Number.POSITIVE_INFINITY;
    if (rankA !== rankB) return rankA - rankB;

    if (a.guessCount !== b.guessCount) return a.guessCount - b.guessCount;

    return a.updatedAt - b.updatedAt;
  });

  return entries.slice(0, limit);
}
function buildCollectiveList(map: CollectiveMap, limit: number): CollectiveEntry[] {
  const entries = Object.values(map);
  entries.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;

    const rankA = a.bestRank ?? Number.POSITIVE_INFINITY;
    const rankB = b.bestRank ?? Number.POSITIVE_INFINITY;
    if (rankA !== rankB) return rankA - rankB;

    return a.lastSeenAt - b.lastSeenAt;
  });

  return entries.slice(0, limit);
}
function getLimitFromRequest(request: Request): number {
  const url = new URL(request.url);
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? parseInt(limitRaw, 10) : 50;
  if (!Number.isFinite(limit) || limit <= 0) return 50;
  return Math.min(limit, 200);
}

function normalizeWord(word: unknown): string | null {
  if (typeof word !== "string") return null;
  const trimmed = word.trim().toLowerCase();
  if (!trimmed || trimmed.length > 64) return null;
  return trimmed;
}

function normalizeScore(score: number | null | undefined): number | null {
  if (score === null || score === undefined) return null;
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  const clamped = Math.max(0, Math.min(1, score));
  return clamped;
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

function getTodayNY(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}
