// Pokémon type icons — the X/Y style pills, which carry the type name as part
// of the artwork rather than being an abstract symbol. That matters for how
// they're used: the icon IS the label, so nothing should print the type name
// beside one.
//
// Resolved with import.meta.glob rather than 18 hand-written import lines, so
// dropping another file into src/assets picks it up with no code change. Vite
// resolves these at build time and each one gets a content hash, exactly as a
// static import would.
//
// Naming convention: "<Type>IC_XY.png" -> keyed as "<type>".
const modules = import.meta.glob('../assets/*IC_XY.png', {
  eager: true,
  import: 'default',
})

const ICONS = Object.fromEntries(
  Object.entries(modules).map(([path, url]) => {
    const file = path.slice(path.lastIndexOf('/') + 1)
    return [file.replace('IC_XY.png', '').toLowerCase(), url]
  }),
)

/**
 * The icon for a type, or null when we don't have one.
 *
 * Null is a real case, not a defensive branch: as of 2026-08-10 there is no
 * Water icon in src/assets, and Water is a common Tera type. Callers must have
 * a text fallback.
 *
 * @param {string} type - e.g. "Fire", from the battle protocol's
 *   |-terastallize| line, which capitalises it
 */
export function typeIcon(type) {
  return ICONS[String(type ?? '').toLowerCase()] ?? null
}

/** Every type we have artwork for, lowercased. Useful for tests and audits. */
export const TYPES_WITH_ICONS = Object.keys(ICONS).sort()
