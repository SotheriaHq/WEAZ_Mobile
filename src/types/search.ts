export type SearchEntityType = 'profile' | 'product' | 'brand' | 'design' | 'collection' | 'tag';

export interface SearchHighlightOffset {
  start: number;
  end: number;
}

export interface SearchItem {
  id: string;
  type: SearchEntityType;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  href: string;
  score: number;
  price?: number | null;
  salePrice?: number | null;
  currency?: string | null;
  metadata?: Record<string, unknown>;
  highlights?: {
    title?: SearchHighlightOffset[];
    description?: SearchHighlightOffset[];
  };
}

export interface SearchSuggestionLink {
  query: string;
  href: string;
}

export interface SearchTrendingLink extends SearchSuggestionLink {
  score: number;
}

export interface SearchSuggestionSection {
  items: SearchItem[];
  total: number;
}

export interface SearchSuggestionTag {
  id: string;
  type: 'tag';
  title: string;
  href: string;
  score: number;
}

export interface SearchSuggestionResponse {
  query: string;
  normalizedQuery: string;
  recent: SearchSuggestionLink[];
  trending: SearchTrendingLink[];
  profiles: SearchSuggestionSection;
  products: SearchSuggestionSection;
  brands: SearchSuggestionSection;
  designs: SearchSuggestionSection;
  storeCollections: SearchSuggestionSection;
  tags: SearchSuggestionTag[];
}

export interface SearchResponse {
  query: string;
  normalizedQuery: string;
  types: SearchEntityType[];
  items: SearchItem[];
  counts: Record<SearchEntityType, number>;
  meta: {
    page: number;
    limit: number;
    hasNextPage: boolean;
  };
}

export interface SearchRequestParams {
  q: string;
  type?: SearchEntityType | 'all';
  page?: number;
  limit?: number;
  brandId?: string;
}
