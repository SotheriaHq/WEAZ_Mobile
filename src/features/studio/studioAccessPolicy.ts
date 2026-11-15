/** Setup is an explicit capability; unknown is never an approval. */
export function resolveStudioSetupAccess(
  route: string,
  complete: boolean | null,
): 'allow' | 'check' | 'setup' {
  if (route === 'essentials' || route === 'setup') return 'allow';
  if (complete === true) return 'allow';
  return complete === false ? 'setup' : 'check';
}
