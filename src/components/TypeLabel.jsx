import { typeIcon } from '../data/typeIcons.js'

/**
 * A Pokémon type, drawn as its X/Y icon.
 *
 * The artwork already spells the type out, so this deliberately does NOT put
 * the name next to it — that would read as "FIRE Fire". The name instead goes
 * in `alt`, which keeps it available to screen readers and to anyone whose
 * images fail to load, so the text is never actually lost.
 *
 * Rendered at the artwork's native 50×20 so it stays pixel-crisp; scaling these
 * up softens the lettering, which is the whole content of the image.
 *
 * Types with no icon fall back to plain text. That isn't hypothetical — there
 * is no Water icon in src/assets yet.
 */
function TypeLabel({ type }) {
  const icon = typeIcon(type)

  if (!icon) return <span>{type}</span>

  return (
    <img
      src={icon}
      alt={type}
      width="50"
      height="20"
      className="align-middle"
      // The pills are drawn with their own outline, so they need no border or
      // background from us.
      style={{ imageRendering: 'auto' }}
    />
  )
}

export default TypeLabel
