import type { HitStatus } from "../types";

export interface ImapAccount {
  id: string;
  label: string;
  imap_host: string;
  imap_port: number;
  username: string;
  password_encrypted: string;
  use_ssl: boolean;
  inbox_folder: string;
  processed_folder: string;
  review_folder: string;
  is_active: boolean;
  last_check_at: string | null;
  last_check_status: string | null;
  last_check_message: string | null;
  created_at: string;
}

export interface MonitoringSubscription {
  id: string;
  name: string;
  email: string;
  frequency: string;
  is_active: boolean;
  created_at: string;
}

export interface BrandStem {
  id: string;
  stem: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ProcessedEmail {
  id: string;
  message_id: string;
  subject: string;
  from_address: string;
  received_at: string;
  hits_found: number;
  errors: string[];
  processed_at: string;
  imap_account_id: string;
}

export interface DeadLetterEntry {
  id: string;
  message_id: string;
  subject: string;
  from_address: string;
  received_at: string;
  error_message: string;
  raw_body: string;
  created_at: string;
  imap_account_id: string;
}

export type TrademarkMatchType =
  | "exact"
  | "compound"
  | "fuzzy"
  | "phonetic"
  | "class_only";

export type TrademarkPriority = "low" | "medium" | "high" | "critical";

export type TrademarkWorkflowStatus = HitStatus;

export interface Trademark {
  id: string;
  aktenzeichen: string;
  markenname: string;
  anmelder: string | null;
  anmeldetag: string | null;
  veroeffentlichungstag: string | null;
  widerspruchsfrist_ende: string | null;
  status: string | null;
  nizza_klassen: number[];
  quelle: string | null;
  quelle_detail: string | null;
  match_type: TrademarkMatchType | null;
  markenstamm: string | null;
  register_url: string | null;
  relevance_score: number | null;
  branchenbezug: string | null;
  prioritaet: TrademarkPriority | null;
  begruendung: string | null;
  raw_email_id: string | null;
  workflow_status: TrademarkWorkflowStatus;
  notes: string | null;
  waren_dienstleistungen: string | null;
  inhaber_anschrift: string | null;
  vertreter: string | null;
  markenform: string | null;
  schutzdauer_bis: string | null;
  resolved_website: string | null;
  website_profile: Record<string, unknown> | null;
  created_at: string;
  last_seen_at: string;
  updated_at: string;
}

export interface DpmaKurierHit {
  aktenzeichen: string;
  markenname: string;
  anmelder: string | null;
  anmeldetag: string | null;
  veroeffentlichungstag: string | null;
  status: string | null;
  nizza_klassen: number[];
  waren_dienstleistungen: string | null;
  inhaber_anschrift: string | null;
  vertreter: string | null;
  markenform: string | null;
  schutzdauer_bis: string | null;
}
