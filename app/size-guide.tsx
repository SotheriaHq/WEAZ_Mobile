import { Redirect } from 'expo-router';

/**
 * The size guide moved to `/charts`.
 *
 * It was a static table reachable only from Settings → Size Guide. It now
 * lives on the island as Charts (`app/(tabs)/charts.tsx`), reads the shopper's
 * own fittings, and lets every row and column be pressed. This route stays so
 * any link or notification that still points at `/size-guide` lands on it
 * rather than a missing screen.
 */
export default function SizeGuideRedirect() {
  // Cast until the dev server regenerates typed routes for `(tabs)/charts`.
  return <Redirect href={'/charts' as never} />;
}
