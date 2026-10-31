export type AxisPersonMetadata = { name: string; roleTitle: string; department: string }
const PREFIX = '@axis-person '

/** Project-specific identity fields share the existing description storage.
 * Preserve free-form notes and older descriptions when editing the metadata. */
export function readAxisPersonMetadata(description?: string | null): Partial<AxisPersonMetadata> {
  const line = description?.split('\n').find(line => line.startsWith(PREFIX))
  if (!line) return {}
  try {
    const parsed = JSON.parse(line.slice(PREFIX.length))
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(['name', 'roleTitle', 'department'].filter(key => typeof parsed[key] === 'string').map(key => [key, parsed[key]]))
  } catch { return {} }
}

export function withAxisPersonMetadata(description: string | null | undefined, metadata: AxisPersonMetadata) {
  const notes = (description || '').split('\n').filter(line => !line.startsWith(PREFIX)).join('\n')
  return `${PREFIX}${JSON.stringify(metadata)}${notes ? `\n${notes}` : ''}`
}
