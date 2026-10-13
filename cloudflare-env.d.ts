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
    DB?: D1Database;
    BUCKET?: R2Bucket;
    DEVYO_PROFILE_PHOTOS?: R2Bucket;
    DEVYO_PROFILE_IMAGES?: ImagesBinding;
    DEVYO_PROFILE_PHOTOS_ENABLED?: string;
    DEVYO_PROFILE_PHOTOS_SCHEMA_READY?: string;
    DEVYO_PHOTO_STORAGE?: 'd1'|'r2';
    DEVYO_NETWORKING_ENABLED?: string;
    DEVYO_NETWORKING_SCHEMA_READY?: string;
    DEVYO_ORGANIZER_REVIEW_ENABLED?: string;
    DEVYO_ORGANIZER_REVIEW_SCHEMA_READY?: string;
    DEVYO_SELF_IDENTITY_ENABLED?: string;
  }
}
