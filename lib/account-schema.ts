import {integer,sqliteTable,text,index} from 'drizzle-orm/sqlite-core';
/** Durable deletion intent also prevents a stale session from restoring deleted data. */
export const accountDeletions=sqliteTable('account_deletions',{
 ownerId:text('owner_id').primaryKey(),phase:text('phase').notNull(),
 closeOwnedGroups:integer('close_owned_groups').notNull(),ownedGroupCount:integer('owned_group_count').notNull(),
 requestedAt:integer('requested_at').notNull(),completedAt:integer('completed_at'),
 attempts:integer('attempts').notNull().default(0),nextAttemptAt:integer('next_attempt_at').notNull().default(0),
 leaseUntil:integer('lease_until').notNull().default(0),errorCode:text('error_code'),
},t=>[index('account_deletion_pending').on(t.phase,t.nextAttemptAt)]);
/** Event-wide cleanup status contains no attendee identity or content. */
export const eventCleanup=sqliteTable('event_cleanup',{
 eventId:text('event_id').primaryKey(),phase:text('phase').notNull(),scopeHash:text('scope_hash'),
 eventEndsAt:integer('event_ends_at').notNull(),deadlineAt:integer('deadline_at').notNull(),
 leaseUntil:integer('lease_until').notNull().default(0),attempts:integer('attempts').notNull().default(0),
 completedAt:integer('completed_at'),errorCode:text('error_code'),
});
