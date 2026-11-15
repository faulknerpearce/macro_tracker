/// <reference types="@cloudflare/workers-types" />

import { handlePublicToolSchema } from '@macro_tracker/mcp-server/schema'

export const onRequest = async () => handlePublicToolSchema()
