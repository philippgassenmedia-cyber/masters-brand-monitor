export type HitStatus =
  | "new"
  | "reviewing"
  | "confirmed"
  | "dismissed"
  | "sent_to_lawyer"
  | "resolved";

export type ViolationCategory =
  | "clear_violation"
  | "suspected_violation"
  | "borderline"
  | "generic_use"
  | "own_brand"
  | "other_industry"
  | "not_relevant";

export interface Hit {
  id: string;
  url: string;
  domain: string;
  title: string;
  snippet: string;
  first_seen_at: string;
  last_seen_at: string;
  seen_count: number;
  company_name: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  social_links: Record<string, string> | null;
  impressum_raw: string | null;
  impressum_scraped_at: string | null;
  ai_score: number | null;
  ai_is_violation: boolean | null;
  ai_reasoning: string | null;
  ai_recommendation: string | null;
  ai_model: string | null;
  ai_analyzed_at: string | null;
  violation_category: ViolationCategory | null;
  subject_company_address: string | null;
  address_key: string | null;
  resolved_website: string | null;
  status: HitStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RawSearchResult {
  url: string;
  title: string;
  snippet: string;
}

export interface ImpressumProfile {
  company_name: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  social_links: Record<string, string> | null;
  raw: string | null;
}

export interface AIAnalysis {
  score: number;
  is_violation: boolean;
  violation_category: ViolationCategory;
  reasoning: string;
  recommendation: string;
  subject_company: string | null;
  subject_company_address: string | null;
  model: string;
}
