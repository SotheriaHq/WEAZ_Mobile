import { apiClient } from '@/src/api/httpClient';

export type CategoryProposal = {
  id: string;
  name: string;
  garmentTypeName: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  description?: string | null;
  rejectionReason?: string | null;
};
export function normalizeCategoryProposal(value: unknown): CategoryProposal | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.name !== 'string' ||
    !['PENDING', 'APPROVED', 'REJECTED'].includes(String(row.status))) return null;
  return { id: row.id, name: row.name,
    garmentTypeName: typeof row.garmentTypeName === 'string' ? row.garmentTypeName : null,
    status: row.status as CategoryProposal['status'],
    description: typeof row.description === 'string' ? row.description : null,
    rejectionReason: typeof row.rejectionReason === 'string' ? row.rejectionReason : null };
}
function unwrap(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') throw new Error('Category request response is unavailable.');
  const row = value as Record<string, unknown>;
  const data = row.data ?? row;
  if (!data || typeof data !== 'object') throw new Error('Category request response is unavailable.');
  return data as Record<string, unknown>;
}
export async function listCategorySuggestions(cursor?: string, signal?: AbortSignal) {
  const response = await apiClient.get('/categories/suggestions/mine', { params: { cursor, limit:25 }, signal });
  const page = unwrap(response.data);
  if (!Array.isArray(page.items)) throw new Error('Category requests could not be read. Please retry.');
  return { items: page.items.map(normalizeCategoryProposal).filter((row): row is CategoryProposal => row !== null),
    nextCursor: typeof page.nextCursor === 'string' ? page.nextCursor : null };
}
export async function submitCategorySuggestion(input: {name:string;garmentTypeName:string;description:string}) {
  const response = await apiClient.post('/categories/suggestions', input);
  const proposal = normalizeCategoryProposal(unwrap(response.data));
  if (!proposal) throw new Error('Refresh your requests to check whether this request was saved.');
  return proposal;
}
