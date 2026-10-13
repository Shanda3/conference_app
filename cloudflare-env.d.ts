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
  }
}
