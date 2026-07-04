/**
 * Mock fixtures used by the pages until the API layer is wired in the next PR.
 * Shapes match src/api/types.ts so swapping in real data is a drop-in change.
 */
import type {
  CompanyIntelReport,
  Education,
  Experience,
  GithubRepo,
  Job,
  Language,
  PastCoverLetter,
  Profile,
  Project,
  Settings,
  Skill,
} from "@/api/types";

export const mockProfile: Profile = {
  name: "Mehmet",
  surname: "Erguden",
  email: "mehmet@example.com",
  phone: "+90 555 000 0000",
  linkedin: "https://linkedin.com/in/mehmeterguden",
  github: "https://github.com/mehmeterguden",
  summary:
    "Software engineer who cares about making tools feel effortless. Happiest shipping polished, human-centered products end to end.",
  style_profile: {
    llm_analyzed: true,
    summary:
      "You write with a quiet intensity that blends a personal obsession for craft with concrete evidence. You lead with a story, then back it with what you actually built.",
    self_presentation: "Humble but confident; story-led, then results-led.",
    tone: "Warm but precise, quietly confident, a little obsessive about details.",
    signature_phrases: [
      "obsessed with making software feel effortless",
      "I couldn't stop tinkering",
      "shipping things people actually use",
    ],
    vocabulary: ["craft", "ship", "effortless", "polish", "human-centered", "end to end"],
    sentence_patterns: "Medium-length sentences with occasional em-dashes for asides.",
    rhetorical_moves: "Open with a small personal story, pivot to concrete impact.",
    emphasis: ["craft", "shipping", "users", "ownership"],
    opening_habits: "Starts with a genuine reason the company caught their attention.",
    closing_habits: "Closes by looking forward, never with boilerplate.",
    avoid: ["synergy", "rockstar", "ninja", "game-changer", "leverage"],
    length: "medium",
    word_count: 320,
    pronoun_style: "first person singular (I)",
    sentence_style: "balanced, with varied rhythm",
  },
};

export const mockSkills: Skill[] = [
  { id: 1, name: "TypeScript", category: "Languages", self_rating: 5, years_experience: 4, cv_mentioned: true },
  { id: 2, name: "React", category: "Frontend", self_rating: 5, years_experience: 4, cv_mentioned: true },
  { id: 3, name: "Python", category: "Languages", self_rating: 4, years_experience: 3, cv_mentioned: true },
  { id: 4, name: "FastAPI", category: "Backend", self_rating: 4, years_experience: 2, cv_mentioned: true },
  { id: 5, name: "PostgreSQL", category: "Data", self_rating: 3, years_experience: 2, cv_mentioned: false },
  { id: 6, name: "Docker", category: "Infra", self_rating: 3, years_experience: 2, cv_mentioned: false },
];

export const mockExperiences: Experience[] = [
  {
    id: 1,
    company: "Northwind Labs",
    title: "Frontend Engineer",
    employment_type: "full_time",
    location: "Remote",
    start_date: "2023-01",
    end_date: null,
    is_current: true,
    description: "Lead the design system and rebuilt the onboarding flow, lifting activation by 18%.",
  },
  {
    id: 2,
    company: "Globex",
    title: "Software Engineering Intern",
    employment_type: "internship",
    location: "Istanbul",
    start_date: "2022-06",
    end_date: "2022-09",
    is_current: false,
    description: "Built an internal analytics dashboard used daily by the growth team.",
  },
];

export const mockEducation: Education[] = [
  {
    id: 1,
    institution: "Bogazici University",
    degree: "B.Sc.",
    field: "Computer Engineering",
    location: "Istanbul",
    start_date: "2019",
    end_date: "2023",
    is_current: false,
    gpa: "3.6",
  },
];

export const mockProjects: Project[] = [
  {
    id: 1,
    name: "Cover Letter Local",
    role: "Creator",
    description: "A fully local, privacy-first AI job-application assistant.",
    technologies: ["React", "FastAPI", "ChromaDB"],
    url: "https://github.com/mehmeterguden",
  },
];

export const mockLanguages: Language[] = [
  { id: 1, name: "Turkish", proficiency: "native" },
  { id: 2, name: "English", proficiency: "fluent" },
];

export const mockRepos: GithubRepo[] = [
  {
    id: 1,
    repo_name: "cover-letter-local",
    url: "https://github.com/mehmeterguden/cover-letter-local",
    stars: 42,
    last_updated: "2026-06-20",
    technologies: ["Python", "TypeScript", "React"],
    description: "Privacy-first local AI cover-letter assistant.",
    contribution: "Sole author — backend, AI core, and frontend.",
    involvement_rating: 5,
  },
  {
    id: 2,
    repo_name: "mini-vector-db",
    url: "https://github.com/mehmeterguden/mini-vector-db",
    stars: 8,
    last_updated: "2026-03-11",
    technologies: ["Rust"],
    description: "A tiny experimental vector store.",
    contribution: "Built the HNSW index from scratch.",
    involvement_rating: 4,
  },
];

export const mockPastLetters: PastCoverLetter[] = [
  {
    id: 1,
    content:
      "Dear hiring team, I've always been obsessed with making software feel effortless. When I built my first tool, I couldn't stop tinkering until it disappeared into the workflow…",
    ai_rating: 5,
    user_rating: 5,
  },
  {
    id: 2,
    content:
      "I love shipping things people actually use. At Northwind I rebuilt onboarding end to end and watched activation climb — that feedback loop is what keeps me going…",
    ai_rating: 4,
    user_rating: null,
  },
];

export const mockJobs: Job[] = [
  { id: 1, company: "Microsoft", role: "Software Engineering Intern", status: "interview", match_score: 88 },
  { id: 2, company: "Vercel", role: "Frontend Engineer", status: "sent", match_score: 76 },
  { id: 3, company: "Linear", role: "Product Engineer", status: "draft", match_score: 71 },
  { id: 4, company: "Stripe", role: "Platform Engineer", status: "rejected", match_score: 54 },
];

export const mockSettings: Settings = {
  llm_provider: "ollama",
  llm_base_url: "http://localhost:11434",
  llm_model: "qwen2.5:7b",
  embedding_model: "all-MiniLM-L6-v2",
  ocr_enabled: false,
};

export const mockReport: CompanyIntelReport = {
  company: "Microsoft",
  role: "Software Engineering Intern",
  completeness: 92,
  from_cache: false,
  fit: {
    overall_score: 88,
    technical_skills: {
      score: 90,
      matched: ["TypeScript", "React", "Python", "Docker"],
      missing: ["C#", "Azure"],
    },
    experience_level: { score: 84, notes: "Internship + one FT role aligns well with an SWE intern posting." },
    recommendation: "Strong fit — emphasize shipped products and end-to-end ownership.",
  },
  ammo: [
    "Microsoft is investing heavily in on-device AI — your privacy-first local assistant is directly relevant.",
    "The team values engineers who ship end to end; your solo-built full-stack project is a proof point.",
  ],
  sections: [
    {
      key: "overview",
      title: "Overview",
      body: "Microsoft is a multinational technology company focused on software, cloud (Azure), devices, and AI. Recent strategy centers on integrating AI across its product suite.",
      bullets: ["Founded 1975", "HQ Redmond, WA", "~220,000 employees"],
      sources: [
        { label: "wikipedia.org", url: "https://en.wikipedia.org/wiki/Microsoft", ok: true },
        { label: "microsoft.com", url: "https://microsoft.com", ok: true },
      ],
    },
    {
      key: "values",
      title: "Values & culture",
      body: "A growth-mindset culture emphasizing inclusion, customer obsession, and 'one Microsoft' collaboration across teams.",
      bullets: ["Growth mindset", "Customer obsession", "Diversity & inclusion"],
      sources: [{ label: "microsoft.com/culture", url: "https://microsoft.com", ok: true }],
    },
    {
      key: "tech",
      title: "Tech stack",
      body: "Broad stack across C#/.NET, TypeScript, Python, Azure, and increasingly AI tooling and Copilot integrations.",
      bullets: ["C# / .NET", "TypeScript", "Azure", "AI / Copilot"],
      sources: [{ label: "github.com/microsoft", url: "https://github.com/microsoft", ok: true }],
    },
    {
      key: "signals",
      title: "Recent signals",
      body: "Continued AI investment and Copilot expansion across Windows, Office, and developer tools.",
      bullets: ["Copilot everywhere", "On-device AI push"],
      sources: [
        { label: "news.ycombinator.com", url: "https://news.ycombinator.com", ok: true },
        { label: "gdelt (rate-limited)", ok: false },
      ],
    },
  ],
};

/** A short cover letter used to simulate token streaming on the Write page. */
export const mockLetter = `Dear Microsoft hiring team,

I've always been obsessed with making software feel effortless — the kind of tool that disappears into the work. That's exactly why your push toward on-device AI caught my attention: I recently built a fully local, privacy-first cover-letter assistant, backend to frontend, because I couldn't stop tinkering until the whole thing ran on my own machine.

At Northwind Labs I rebuilt onboarding end to end and watched activation climb 18%, and that feedback loop — ship something, watch real people use it — is what keeps me going. I care about craft the way your teams seem to: polish, ownership, and shipping things people actually use.

I'd love to bring that energy to your team as a Software Engineering Intern.

Warmly,
Mehmet`;
