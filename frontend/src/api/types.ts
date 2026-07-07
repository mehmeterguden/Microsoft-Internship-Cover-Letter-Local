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

export type LLMProviderId = "foundry_local" | "ollama" | "openai" | "anthropic" | "gemini";

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
}

export interface Skill {
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

export interface Project {
  id?: number | null;
  name: string;
  description?: string | null;
  role?: string | null;
  technologies?: string[];
  url?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  github_repo_id?: number | null;
}

export interface Experience {
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

export interface Education {
  id?: number | null;
  institution: string;
  degree?: string | null;
  field?: string | null;
  location?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_current?: boolean;
  gpa?: string | null;
}

export interface Training {
  id?: number | null;
  name: string;
  provider?: string | null;
  description?: string | null;
  completion_date?: string | null;
  url?: string | null;
}

export interface Certificate {
  id?: number | null;
  name: string;
  issuer?: string | null;
  cert_type?: CertificateType | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  credential_id?: string | null;
  url?: string | null;
}

export interface Language {
  id?: number | null;
  name: string;
  proficiency?: LanguageLevel | null;
}

export interface Link {
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
  letter?: { content: Record<string, string>; design: Record<string, unknown> } | null;
}

export interface Settings {
  llm_provider: LLMProviderId;
  llm_base_url: string;
  llm_model: string;
  openai_api_key?: string;
  anthropic_api_key?: string;
  gemini_api_key?: string;
  embedding_model: string;
  tavily_api_key?: string;
  ocr_enabled?: boolean;
  github_token?: string;
}

// ── Company research report (backend core/research/schema.py) ──

export interface ReportSource {
  label: string;
  url?: string;
  ok: boolean;
}

export interface ReportSection {
  key: string;
  title: string;
  body: string;
  bullets?: string[];
  sources: ReportSource[];
}

export interface CVExtraction {
  profile: Profile;
  skills: Skill[];
  experiences: Experience[];
  education: Education[];
  projects: Project[];
  certificates: Certificate[];
  languages: Language[];
  links: Link[];
}

export interface CompanyIntelReport {
  company: string;
  role?: string;
  completeness: number;
  sections: ReportSection[];
  fit?: MatchBreakdown | null;
  ammo?: string[];
  from_cache?: boolean;
}
