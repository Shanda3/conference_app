import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** One private snapshot per authenticated owner; no client-supplied owner IDs. */
export const plannerStates = sqliteTable("planner_states", {
  ownerId: text("owner_id").primaryKey(),
  stateJson: text("state_json").notNull(),
  revision: integer("revision").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export {profiles,scheduleShares} from "../lib/social-schema";
export {chatMemberships,chatMessages,chatFlags} from "../lib/chat-schema";
export * from "../lib/community-schema";
export * from "../lib/account-schema";
