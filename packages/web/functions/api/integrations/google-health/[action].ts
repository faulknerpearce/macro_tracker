/// <reference types="@cloudflare/workers-types" />

import { handleGoogleHealthRequest } from '@input_output/mcp-server/integrations'
import type { PagesOAuthEnv } from '../../../_oauth-env'

interface IntegrationPagesEnv extends PagesOAuthEnv {
  GOOGLE_HEALTH_CLIENT_ID?: string
  GOOGLE_HEALTH_CLIENT_SECRET?: string
  INTEGRATION_ENCRYPTION_KEY?: string
}

/** /api/integrations/google-health/{start|exchange|callback|status|sync|settings|disconnect} */
export const onRequest = async (context: EventContext<IntegrationPagesEnv, 'action', unknown>) => {
  const action = String(context.params.action ?? '')
  const env = context.env
  return handleGoogleHealthRequest(context.request, {
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY,
    OAUTH_SIGNING_SECRET: env.OAUTH_SIGNING_SECRET,
    GOOGLE_HEALTH_CLIENT_ID: env.GOOGLE_HEALTH_CLIENT_ID,
    GOOGLE_HEALTH_CLIENT_SECRET: env.GOOGLE_HEALTH_CLIENT_SECRET,
    INTEGRATION_ENCRYPTION_KEY: env.INTEGRATION_ENCRYPTION_KEY,
    PUBLIC_URL: env.MCP_PUBLIC_URL?.replace(/\/$/, ''),
  }, action)
}
