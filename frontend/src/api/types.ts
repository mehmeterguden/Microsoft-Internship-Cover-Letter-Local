/**
 * TypeScript mirrors of the backend Pydantic models (see backend/models.py).
 * Kept as plain interfaces / string-literal unions — the single source of truth
 * for shapes shared between the API layer, the store, and the pages.
 */

export type EmploymentType =
  | "full_time"
  | "part_time"
  | "internship"
  | "freelance"
  | "volunteer"
  | "other";

export type CertificateType =
  | "professional"
  | "course"
  | "exam"
  | "language"
  | "award"
  | "bootcamp"
  | "other";

export type SkillEntity = "repo" | "project" | "experience" | "certificate" | "training";

export type LanguageLevel = "native" | "fluent" | "professional" | "intermediate" | "basic";

export type JobStatus = "draft" | "sent" | "interview" | "rejected" | "offer";

export type LLMProviderId = "foundry_local" | "ollama" | "lm_studio" | "openai" | "anthropic" | "gemini";
export type ResearchCacheRetention = "off" | "7_days" | "30_days" | "forever" | "last_10";
/** How aggressively to warn about personal data in generated letters. */
export type PiiShieldMode = "off" | "risky_only" | "on";

/** Where a piece of profile data originally came from. */
export type Source = "manual" | "cv" | "github" | "linkedin";

/** Provenance carried by every list entity (see backend `Sourced`). */
export interface Sourced {
  source?: Source;
  source_detail?: string | null;
  source_at?: string | null;
}

/** Provenance for a single profile field. */
export interface FieldSource {
  source?: Source;
  detail?: string | null;
  at?: string | null;
}

export type Tone = "professional" | "warm" | "confident" | "concise";

export interface VoiceProfile {
  word_count?: number | null;
  length?: string;
  sentence_style?: string;
  pronoun_style?: string;
  enough_signal?: boolean;
  tagline?: string;
  summary?: string;
  self_presentation?: string;
  tone?: string;
  formality?: string;
  strengths?: string[];
  themes?: string[];
  signature_phrases?: string[];
  vocabulary?: string[];
  sentence_patterns?: string;
  rhetorical_moves?: string;
  structure?: string;
  emphasis?: string[];
  opening_habits?: string;
  closing_habits?: string;
  example_sentences?: string[];
  avoid?: string[];
  llm_analyzed?: boolean;
}

export interface Profile {
  name?: string | null;
  surname?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin?: string | null;
  github?: string | null;
  summary?: string | null;
  style_profile?: VoiceProfile | null;
  field_sources?: Record<string, FieldSource>;
}

export interface Skill extends Sourced {
  id?: number | null;
  name: string;
  category?: string | null;
  self_rating?: number | null;
  years_experience?: number | null;
  cv_mentioned?: boolean;
  note?: string | null;
}

export interface GithubRepo {
  id?: number | null;
  repo_name: string;
  url?: string | null;
  stars?: number | null;
  last_updated?: string | null;
  technologies?: string[];
  description?: string | null;
  purpose?: string | null;
  highlights?: string[];
  contribution?: string | null;
  involvement_rating?: number | null;
  readme?: string | null;
}

export interface ScoredSkill {
  name: string;
  score?: number | null;
}

export interface Project extends Sourced {
  id?: number | null;
  name: string;
  description?: string | null;
  role?: string | null;
  technologies?: string[];
  url?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  github_repo_id?: number | null;
  /** GitHub stars, copied for repo-linked projects. */
  stars?: number | null;
}

export interface Experience extends Sourced {
  id?: number | null;
  company: string;
  title: string;
  employment_type?: EmploymentType | null;
  location?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_current?: boolean;
  description?: string | null;
}

export interface Education extends Sourced {
  id?: number | null;
  institution: string;
  degree?: string | null;
  field?: string | null;
  location?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_current?: boolean;
  gpa?: string | null;
  /** Relevant coursework, shown as small pills. */
  courses?: string[];
}

export interface Training extends Sourced {
  id?: number | null;
  name: string;
  provider?: string | null;
  description?: string | null;
  completion_date?: string | null;
  url?: string | null;
}

export interface Certificate extends Sourced {
  id?: number | null;
  name: string;
  issuer?: string | null;
  cert_type?: CertificateType | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  credential_id?: string | null;
  url?: string | null;
}

export interface Language extends Sourced {
  id?: number | null;
  name: string;
  proficiency?: LanguageLevel | null;
}

export interface Link extends Sourced {
  id?: number | null;
  label: string;
  url: string;
  description?: string | null;
}

export interface PastCoverLetter {
  id?: number | null;
  content: string;
  ai_rating?: number | null;
  user_rating?: number | null;
}

export interface MatchBreakdown {
  overall_score: number;
  technical_skills: { score: number; matched: string[]; missing: string[] };
  experience_level: { score: number; notes: string };
  recommendation: string;
}

export interface Job {
  id?: number | null;
  company: string;
  role: string;
  job_description?: string | null;
  match_score?: number | null;
  match_breakdown?: MatchBreakdown | null;
  status: JobStatus;
  /** The saved cover letter: plain text plus a user-set completed flag.
   *  `canvas` may exist on letters saved by the old design editor (read-only). */
  letter?: { text?: string; completed?: boolean; canvas?: unknown } | null;
  /** Server-managed ISO8601 UTC timestamps (read-only; ignored on write). */
  created_at?: string | null;
  updated_at?: string | null;
}

/** How the app reacts when the active API key hits its rate/quota limit. */
export type KeySwitchMode = "auto" | "manual";

/** One entry in the rotating Gemini key pool (see backend `GeminiKey`). */
export interface GeminiKey {
  id: string;
  key: string;
  label?: string;
}

/** The whole Gemini key setup, returned by the /settings/gemini-keys endpoints. */
export interface GeminiKeyConfig {
  keys: GeminiKey[];
  active_id: string;
  mode: KeySwitchMode;
}

/** Where company-name autocomplete gets its data. */
export type CompanySearchProvider = "wikidata" | "brandfetch";

/** One company autocomplete suggestion (see backend `CompanySuggestion`). */
export interface CompanySuggestion {
  name: string;
  domain?: string | null;
  description?: string | null;
  logo?: string | null;
}

export interface Settings {
  llm_provider: LLMProviderId;
  llm_base_url: string;
  llm_model: string;
  openai_api_key?: string;
  anthropic_api_key?: string;
  gemini_api_key?: string;
  gemini_api_keys?: GeminiKey[];
  gemini_active_key_id?: string;
  key_switch_mode?: KeySwitchMode;
  company_search_provider?: CompanySearchProvider;
  brandfetch_client_id?: string;
  embedding_model: string;
  tavily_api_key?: string;
  ocr_enabled?: boolean;
  github_token?: string;
  research_cache_retention?: ResearchCacheRetention;
  pii_shield?: PiiShieldMode;
  /** Cross-encoder rerank on exemplar retrieval (higher precision; needs a model). */
  rag_rerank?: boolean;
}

// ── Company research report (backend core/research/schema.py) ──

export interface ReportSource {
  label: string;
  url?: string | null;
}

export interface ReportEvidence {
  text: string;
  source: ReportSource;
}

export interface CVExtraction {
  profile: Profile;
  skills: Skill[];
  experiences: Experience[];
  education: Education[];
  projects: Project[];
  certificates: Certificate[];
  trainings: Training[];
  languages: Language[];
  links: Link[];
}

export interface Firmographics {
  industry?: string | null;
  size?: string | null;
  employees?: number | null;
  hq?: string | null;
  founded?: string | null;
  website?: string | null;
}
export interface Overview {
  summary?: string | null;
  mission?: string | null;
  division_context?: string | null;
}
export interface ValueSignal {
  name: string;
  weight: number;
  evidence: ReportEvidence[];
}
export interface Culture {
  ways_of_working: string[];
  notes: ReportEvidence[];
}
export interface TechItem {
  name: string;
  you_know: boolean;
  worth_learning: boolean;
  source?: ReportSource | null;
}
export interface NewsSignal {
  headline: string;
  date?: string | null;
  url?: string | null;
  why_it_matters?: string | null;
}
export interface InterviewFocus {
  order: number;
  area: string;
  note?: string | null;
}
export interface RoleAnalysis {
  title?: string | null;
  responsibilities: string[];
  must_haves: string[];
  nice_to_haves: string[];
  keywords: string[];
}
export interface FitDimension {
  name: string;
  you: number;
  role_need: number;
}
export interface Fit {
  score: number;
  verdict?: string | null;
  recommendation?: string | null;
  dimensions: FitDimension[];
  matched_skills: string[];
  gaps: string[];
  experience_fit_pct: number;
}
export interface LetterHook {
  hook: string;
  use_in_letter?: string | null;
}
export interface ReportMeta {
  sources: ReportSource[];
  section_sources: Record<string, ReportSource[]>;
  confidence: number;
  completeness: number;
  missing: string[];
  gathered_at?: string | null;
  duration_s?: number | null;
  from_cache: boolean;
  agents: string[];
}

/** The full company research report (backend core/research/schema.py). */
export interface CompanyIntelReport {
  company_name: string;
  role_title?: string | null;
  firmographics: Firmographics;
  overview: Overview;
  values: ValueSignal[];
  culture: Culture;
  tech_stack: TechItem[];
  signals: NewsSignal[];
  interview: InterviewFocus[];
  role: RoleAnalysis;
  fit: Fit;
  ammo: LetterHook[];
  meta: ReportMeta;
}
