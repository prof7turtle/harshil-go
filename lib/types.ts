export type RiskLevel = "Low" | "Medium" | "High";

export interface GoDaddyPrice {
  period?: number;
  term?: string;
  price?: {
    currencyCode: string;
    value: number; // in minor units (e.g. cents)
  };
  renewalPrice?: {
    currencyCode: string;
    value: number;
  };
  firstTermPrice?: {
    currencyCode: string;
    value: number;
  };
  recommended?: boolean;
}

export interface GoDaddySuggestionRaw {
  domain: string;
  inventory?: string;
  prices?: GoDaddyPrice[];
}

export interface DirectDomainItem {
  domain: string;
  price?: string;
  originalPrice?: string;
  available?: boolean;
  inventory?: string;
  raw?: GoDaddySuggestionRaw;
}

export interface ContextDomainItem {
  domain: string;
  relevanceScore: number; // 0 - 100
  riskLevel: RiskLevel;
  available: boolean;
  price?: string;
  renewalPrice?: string;
  reason?: string;
}

export interface DirectSuggestionsRequest {
  query: string;
}

export interface DirectSuggestionsResponse {
  items: DirectDomainItem[];
  error?: string;
}

export interface ContextSuggestionsRequest {
  brand: string;
  query: string;
}

export interface ContextSuggestionsResponse {
  items: ContextDomainItem[];
  enrichedPhrases?: string[];
  generatedCount?: number;
  error?: string;
}
