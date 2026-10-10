import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

/**
 * Three tables. Every row belongs to the player who created it
 * (allow.owner): players only see their own rows in the game, while you,
 * as admin, can see everything in Amplify console -> Data manager.
 */
const schema = a.schema({
  /** Create-account info + level / coins / streak summary (one row per player) */
  UserProfile: a
    .model({
      username: a.string().required(),
      displayName: a.string().required(),
      email: a.string(),               // real email typed on sign-up (optional)
      avatar: a.string(),
      loginCount: a.integer(),
      lastLoginAt: a.datetime(),
      xp: a.integer(),
      coins: a.integer(),
      streak: a.integer(),
      bestStreak: a.integer(),
      totalSessions: a.integer(),
      lastPlayDate: a.string(),
      gameState: a.json()              // inventory, settings, best scores, cafe decor
    })
    .authorization((allow) => [allow.owner()]),

  /** Learning progress: one row per player per word */
  WordProgress: a
    .model({
      wordId: a.string().required(),
      word: a.string(),
      stage: a.string(),               // new / learning / review / mastered
      reps: a.integer(),
      interval: a.integer(),           // days until next review
      ef: a.float(),
      seen: a.integer(),
      correct: a.integer(),
      wrong: a.integer(),
      lapses: a.integer(),
      due: a.datetime(),               // next review time
      lastSeen: a.datetime()
    })
    .authorization((allow) => [allow.owner()]),

  /** One row per finished game */
  GameRecord: a
    .model({
      mode: a.string().required(),
      result: a.string(),
      startedAt: a.datetime(),
      endedAt: a.datetime(),
      durationSec: a.integer(),
      score: a.integer(),
      questions: a.integer(),
      correct: a.integer(),
      accuracy: a.integer(),
      xp: a.integer(),
      coins: a.integer(),
      newWords: a.integer(),
      reviewedWords: a.integer(),
      bestCombo: a.integer(),
      words: a.string().array(),
      summary: a.string(),
      detail: a.json()
    })
    .authorization((allow) => [allow.owner()])
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: { defaultAuthorizationMode: 'userPool' }
});
