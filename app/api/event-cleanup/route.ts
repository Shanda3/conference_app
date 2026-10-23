import {env} from 'cloudflare:workers';
import {handleManualCleanupRequest} from '@/lib/event-cleanup-endpoint';
import type {CleanupEndpointEnv} from '@/lib/event-cleanup-endpoint';
export const dynamic='force-dynamic';
export function GET(request:Request){return handleManualCleanupRequest(request,env as CleanupEndpointEnv);}
export function POST(request:Request){return handleManualCleanupRequest(request,env as CleanupEndpointEnv);}
