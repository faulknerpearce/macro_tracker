/// <reference types="@cloudflare/workers-types" />

import { handleMcp } from '@input_output/mcp-server/http'
import { resolveOAuthEnv, type PagesOAuthEnv } from '../_oauth-env'

interface McpPagesEnv extends PagesOAuthEnv {
  GOOGLE_HEALTH_CLIENT_ID?: string
  GOOGLE_HEALTH_CLIENT_SECRET?: string
  INTEGRATION_ENCRYPTION_KEY?: string
}

export const onRequest = async (context: EventContext<McpPagesEnv, string, unknown>) => {
  const oauthEnv = resolveOAuthEnv(context.request, context.env)
  return handleMcp(context.request, {
    SUPABASE_URL: oauthEnv.SUPABASE_URL,
    SUPABASE_ANON_KEY: oauthEnv.SUPABASE_ANON_KEY,
    OAUTH_SIGNING_SECRET: oauthEnv.OAUTH_SIGNING_SECRET,
    MCP_PUBLIC_URL: oauthEnv.MCP_PUBLIC_URL,
    GOOGLE_HEALTH_CLIENT_ID: context.env.GOOGLE_HEALTH_CLIENT_ID,
    GOOGLE_HEALTH_CLIENT_SECRET: context.env.GOOGLE_HEALTH_CLIENT_SECRET,
    INTEGRATION_ENCRYPTION_KEY: context.env.INTEGRATION_ENCRYPTION_KEY,
  })
}
