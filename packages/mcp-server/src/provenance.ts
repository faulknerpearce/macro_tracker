import {
  defaultActivityConfidence,
  defaultFoodConfidence,
  parseActivityLogMethod,
  parseConfidence,
  parseFoodLogMethod,
  parseIntensity,
  type Database,
} from '@macro_tracker/shared'

type FoodInsert = Database['public']['Tables']['food_entries']['Insert']
type ActivityInsert = Database['public']['Tables']['activities']['Insert']

const PROVENANCE_COLUMNS = [
  'log_method',
  'confidence',
  'estimate_notes',
  'logged_via',
  'source',
  'intensity',
  'counted_in_device_total',
]

function readNotes(args: Record<string, unknown>): string {
  const raw = args.estimateNotes ?? args.estimate_notes
  return typeof raw === 'string' ? raw.trim().slice(0, 500) : ''
}

/** Columns describing how a food entry was measured, from MCP tool args. */
export function foodProvenance(
  args: Record<string, unknown>,
): Pick<FoodInsert, 'log_method' | 'confidence' | 'estimate_notes' | 'logged_via'> {
  const method = parseFoodLogMethod(args.logMethod ?? args.log_method)
  const confidence = parseConfidence(args.confidence) ?? defaultFoodConfidence(method)
  const notes = readNotes(args)
  return {
    logged_via: 'mcp',
    ...(method ? { log_method: method } : {}),
    ...(confidence ? { confidence } : {}),
    ...(notes ? { estimate_notes: notes } : {}),
  }
}

export function activityProvenance(
  args: Record<string, unknown>,
  overrides: { logMethod?: 'device' | 'measured' | 'estimate'; notes?: string } = {},
): Pick<ActivityInsert, 'log_method' | 'confidence' | 'estimate_notes' | 'source' | 'intensity'> {
  const method = overrides.logMethod ?? parseActivityLogMethod(args.logMethod ?? args.log_method)
  const confidence = parseConfidence(args.confidence) ?? defaultActivityConfidence(method)
  const intensity = parseIntensity(args.intensity)
  const notes = [readNotes(args), overrides.notes ?? ''].filter(Boolean).join(' ')
  return {
    source: 'mcp',
    ...(method ? { log_method: method } : {}),
    ...(confidence ? { confidence } : {}),
    ...(intensity ? { intensity } : {}),
    ...(notes ? { estimate_notes: notes.slice(0, 500) } : {}),
  }
}

/** True when an insert failed only because migration 0024's columns aren't there yet. */
export function isMissingProvenanceColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const msg = error.message ?? ''
  return (
    (error.code === 'PGRST204' || error.code === '42703' || /column/i.test(msg)) &&
    PROVENANCE_COLUMNS.some((c) => msg.includes(c))
  )
}
