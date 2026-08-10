// The formats the site supports, in the order they appear on the start page.
//
// Display labels are ours on purpose: the ladder API is inconsistent about
// names. gen9ou reports format "OverUsed", but the VGC ladder just echoes its
// own id back ("gen9championsvgc2026regmb"), which is not something to show a
// user.
//
// Every id below was verified against
// https://pokemonshowdown.com/ladder/<id>.json on 2026-07-26.
// Do NOT add a format without checking it the same way: a wrong id does not
// 404, it returns 200 with an empty toplist. See docs/dashboards.md.

export const SUPPORTED_FORMATS = [
  { id: 'gen9ou', label: 'Gen 9 OU', teamPreview: true },
  { id: 'gen9ubers', label: 'Gen 9 Ubers', teamPreview: true },
  { id: 'gen9uu', label: 'Gen 9 UU', teamPreview: true },
  { id: 'gen9monotype', label: 'Monotype', teamPreview: true },
  { id: 'gen9championsvgc2026regmb', label: 'VGC 2026 Reg M-B', teamPreview: true },
  // Random Battle has no team preview, so replays only reveal the Pokémon that
  // were actually sent out. Team-composition stats are incomplete here.
  { id: 'gen9randombattle', label: 'Random Battle', teamPreview: false },
]

// The start page always has a format selected — landing on an empty page with
// no dashboards gives the user nothing to react to. OU is the most active
// ladder, so it's the sensible default.
export const DEFAULT_FORMAT_ID = 'gen9ou'

export function findFormat(id) {
  return SUPPORTED_FORMATS.find((format) => format.id === id) ?? null
}
