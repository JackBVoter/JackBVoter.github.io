// Tidy up Pokémon names coming out of battle logs before they reach the UI.

/**
 * Showdown writes "Zamazenta-*" when a Pokémon's forme was never revealed —
 * team preview showed the species but not which forme it turned out to be.
 * The asterisk is protocol noise, not part of the name.
 */
export function displaySpecies(name) {
  return String(name ?? '').replace(/-\*$/, '')
}
