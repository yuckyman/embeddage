export type Meta = {
  schema_version: number;
  date: string; // YYYY-MM-DD
  day_boundary_tz: string;
  k: number;
  vocab_size: number;
  embed_dim: number;
  projection_method: string;
  projection_params: Record<string, unknown>;
  projection_seed: number;
  secret_hash: string;
  // schema v2+
  secret_id?: number;
  secret_word?: string;
};

export type Artifacts = {
  meta: Meta;
  words: string[];
  rank: Uint32Array;
  localIds: number[];
  localIndexById: Map<number, number>;
  xyz: Float32Array; // flat [x0,y0,z0,x1,y1,z1,...]
};

export type GuessKind = "local" | "outer";

export type Guess = {
  word: string;
  normalized: string;
  id: number | null; // null if OOV
  rank: number | null;
  percentile: number | null; // [0,1]
  score: number | null; // shaped score [0,1]
  color: { r: number; g: number; b: number };
  kind: GuessKind;
  xyz: { x: number; y: number; z: number } | null;
  createdAt: number;
};

export type GameState = {
  date: string;
  artifacts: Artifacts;
  guesses: Guess[];
  secretFound: boolean;
};

