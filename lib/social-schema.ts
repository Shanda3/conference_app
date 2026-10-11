import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/** Names are explicitly chosen; never copy the identity helper's email fallback. */
export const profiles = sqliteTable("profiles", {
  ownerId: text("owner_id").primaryKey(),
  displayName: text("display_name").notNull(),
  company: text("company").notNull().default(""),
  linkedInUrl: text("linkedin_url").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Bearer tokens are never stored, and share IDs alone grant no read access. */
export const scheduleShares = sqliteTable("schedule_shares", {
  tokenHash: text("token_hash").primaryKey(),
  shareId: text("share_id").notNull(),
  ownerId: text("owner_id").notNull(),
  payloadJson: text("payload_json").notNull(),
  createdAt: text("created_at").notNull(),
  revokedAt: text("revoked_at"),
}, (table) => [
  uniqueIndex("schedule_shares_share_id_unique").on(table.shareId),
  index("schedule_shares_owner_created_idx").on(table.ownerId, table.createdAt),
  index("schedule_shares_owner_revoked_idx").on(table.ownerId, table.revokedAt),
]);
