import {
  pgTable, serial, text, integer, real, boolean, timestamp,
  primaryKey, uniqueIndex, index,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'), // null for OAuth-only accounts
  theme: text('theme').notNull().default('midnight'),
  xp: integer('xp').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

// Shared catalog (Phase 2 fills this in; schema ships now so migrations stay linear)
export const puzzles = pgTable(
  'puzzles',
  {
    id: serial('id').primaryKey(),
    brand: text('brand').notNull().default(''),
    title: text('title').notNull(),
    pieceCount: integer('piece_count').notNull(),
    imageUrl: text('image_url'),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_puzzles_piece_count').on(t.pieceCount)],
);

export const solves = pgTable(
  'solves',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    puzzleId: integer('puzzle_id').references(() => puzzles.id),
    date: text('date').notNull(), // YYYY-MM-DD
    pieces: integer('pieces').notNull(),
    timeSeconds: integer('time_seconds').notNull(),
    scaledTimeSeconds: real('scaled_time_seconds').notNull(),
    puzzleName: text('puzzle_name').notNull().default(''),
    brand: text('brand').notNull().default(''),
    difficultyRating: integer('difficulty_rating').notNull().default(3),
    notes: text('notes').notNull().default(''),
    tags: text('tags').notNull().default(''),
    isPersonalBest: boolean('is_personal_best').notNull().default(false),
    puzzleType: text('puzzle_type').notNull().default('solo'), // solo | duo | team
    firstAttempt: boolean('first_attempt').notNull().default(false),
    source: text('source').notNull().default(''), // '' | 'speedpuzzling' | 'csv'
    sourceId: text('source_id'), // myspeedpuzzling result_id (dedupe key)
    communityAvgTime: integer('community_avg_time'),
    communityBestTime: integer('community_best_time'),
    playerRank: integer('player_rank'),
    communitySolvers: integer('community_solvers'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_solves_user_date').on(t.userId, t.date),
    index('idx_solves_user_pieces').on(t.userId, t.pieces),
    uniqueIndex('uq_solves_user_source').on(t.userId, t.sourceId),
  ],
);

export const splits = pgTable(
  'splits',
  {
    id: serial('id').primaryKey(),
    solveId: integer('solve_id').notNull().references(() => solves.id, { onDelete: 'cascade' }),
    phase: text('phase').notNull(), // e.g. 'edge', 'sort', 'assembly'
    seconds: integer('seconds').notNull(),
    position: integer('position').notNull().default(0),
  },
  (t) => [index('idx_splits_solve').on(t.solveId)],
);

export const goals = pgTable('goals', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  pieces: integer('pieces').notNull(),
  targetTimeSeconds: integer('target_time_seconds').notNull(),
  description: text('description').notNull().default(''),
  achieved: boolean('achieved').notNull().default(false),
  achievedDate: text('achieved_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const achievements = pgTable(
  'achievements',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    icon: text('icon').notNull(),
    unlocked: boolean('unlocked').notNull().default(false),
    unlockedDate: text('unlocked_date'),
  },
  (t) => [uniqueIndex('uq_achievements_user_code').on(t.userId, t.code)],
);

export const settings = pgTable(
  'settings',
  {
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: text('value').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);
