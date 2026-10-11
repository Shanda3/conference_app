import { integer, primaryKey, sqliteTable, text, index } from "drizzle-orm/sqlite-core";
export const chatMemberships = sqliteTable("chat_memberships", {
  ownerId: text("owner_id").notNull(), conferenceId: text("conference_id").notNull(), joinedAt: integer("joined_at").notNull(),
}, t => [primaryKey({columns:[t.ownerId,t.conferenceId]})]);
export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(), conferenceId: text("conference_id").notNull(), ownerId: text("owner_id").notNull(),
  displayName: text("display_name").notNull(), body: text("body").notNull(), createdAt: integer("created_at").notNull(), deletedAt: integer("deleted_at"),
}, t => [index("chat_room_time").on(t.conferenceId,t.createdAt),index("chat_owner_time").on(t.ownerId,t.createdAt)]);
export const chatFlags = sqliteTable("chat_flags", {
  ownerId: text("owner_id").notNull(), messageId: text("message_id").notNull(), conferenceId: text("conference_id").notNull(),
  kind: text("kind").notNull(), reason: text("reason").notNull(), createdAt: integer("created_at").notNull(),
}, t => [primaryKey({columns:[t.ownerId,t.messageId]})]);
