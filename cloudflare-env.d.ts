declare namespace Cloudflare {
  interface Env {
    CLERK_PUBLISHABLE_KEY?: string;
    CLERK_SECRET_KEY?: string;
    CLERK_JWT_KEY?: string;
    CLERK_ISSUER?: string;
    DEVYO_ORIGIN?: string;
    DEVYO_ENVIRONMENT?: 'local'|'staging'|'production';
    DEVYO_ADDITIONAL_ORIGINS?: string;
    DEVYO_ACCESS_POLICY?: 'allowlist'|'registered';
    DEVYO_RETENTION_POLICY?: string;
    DEVYO_EVENT_ENDS_AT?: string;
    DEVYO_CLEANUP_INSTANCE_ID?: string;
    DEVYO_ALLOWED_USER_IDS?: string;
    DEVYO_MESSAGING_SCHEMA_READY?: string;
    DEVYO_PUSH_ENABLED?: string;
    DEVYO_VAPID_PUBLIC_KEY?: string;
    DEVYO_VAPID_PRIVATE_KEY?: string;
    DEVYO_VAPID_SUBJECT?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
    DEVYO_PROFILE_IMAGES?: ImagesBinding;
    DEVYO_TALK_DISCUSSIONS_ENABLED?: string;
    DEVYO_TALK_DISCUSSIONS_SCHEMA_READY?: string;
    DEVYO_TALK_MODERATOR_USER_IDS?: string;
    DEVYO_PROFILE_PHOTOS_ENABLED?: string;
    DEVYO_ATTENDEE_SOCIAL_SCHEMA_READY?: string;
    DEVYO_CONNECTION_NOTIFICATIONS_ENABLED?: string;
    DEVYO_COMMUNITIES_ENABLED?: string;
    DEVYO_PROFILE_PHOTOS_SCHEMA_READY?: string;
    DEVYO_PHOTO_STORAGE?: 'd1';
  }
}
