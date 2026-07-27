import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Trash2, Mail, Phone, Github, Linkedin, Globe, Twitter, Youtube, Instagram, Gitlab } from "lucide-react";
import { Page } from "@/components/common/Page";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Toggle } from "@/components/ui/controls";
import { SearchSelect, DateField, TagField } from "@/components/ui/pickers";
import {
  toOptions, DEGREES, SKILL_CATEGORIES, FIELDS_OF_STUDY, LANGUAGES, COUNTRIES, TECHNOLOGIES, CERT_ISSUERS, UNIVERSITIES,
} from "@/lib/suggestions";
import { Pill, Spinner } from "@/components/ui/feedback";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { AsyncBoundary } from "@/components/common/AsyncBoundary";
import { ProfileInterviewModal } from "@/components/profile/ProfileInterviewModal";
import { useAsync } from "@/lib/useAsync";
import { toast } from "@/store/toast";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/api/client";
import {
  certificatesApi,
  educationApi,
  experiencesApi,
  getProfile,
  languagesApi,
  linksApi,
  projectsApi,
  saveProfile,
  skillsApi,
  trainingsApi,
} from "@/api/profile";
import {
  applyCompletion,
  getCompletionPlan,
  streamDraft,
  streamRefine,
  streamSuggestions,
  type ApplyPayload,
  type CompletionStep,
  type DraftEvent,
  type SuggestionEvent,
} from "@/api/profileCompletion";
import type {
  Certificate,
  Education,
  Experience,
  FieldSource,
  Language,
  LanguageLevel,
  Link,
  Profile as ProfileModel,
  Project,
  Skill,
  Source,
  Training,
} from "@/api/types";

/* ══════════════════════════════════════════════════════════════════
   Profile & Skills — wired to the real backend.

   • LOAD    getProfile() + the 8 entity list apis (Promise.all), rendered
             through useAsync/AsyncBoundary with real provenance badges.
   • CRUD    each section's "+" / empty prompt → add form (Dialog) → create;
             item click → detail (Dialog) → edit form / delete (ConfirmDialog).
             Identity + summary edit → saveProfile. Toast + reload on mutation.
   • AI      the header CTA opens a modal that runs getCompletionPlan() then
             streamSuggestions(...) field-by-field, then applyCompletion(...).
   The design is preserved; the "DATA STATE" preview switcher is replaced by a
   real sync-status indicator derived from the loaded provenance.
   ══════════════════════════════════════════════════════════════════ */

/* ── Domain ───────────────────────────────────────────────────────── */
type Kind = "skill" | "experience" | "education" | "project" | "certificate" | "training" | "language" | "link";
type EntityItem = Skill | Experience | Education | Project | Certificate | Training | Language | Link;

type Bundle = {
  profile: ProfileModel;
  skills: Skill[];
  experiences: Experience[];
  education: Education[];
  languages: Language[];
  projects: Project[];
  certificates: Certificate[];
  trainings: Training[];
  links: Link[];
};

async function loadBundle(): Promise<Bundle> {
  const [profile, skills, experiences, education, languages, projects, certificates, trainings, links] =
    await Promise.all([
      getProfile(),
      skillsApi.list(),
      experiencesApi.list(),
      educationApi.list(),
      languagesApi.list(),
      projectsApi.list(),
      certificatesApi.list(),
      trainingsApi.list(),
      linksApi.list(),
    ]);
  return { profile, skills, experiences, education, languages, projects, certificates, trainings, links };
}

const KIND_LABEL: Record<Kind, string> = {
  skill: "Skill",
  experience: "Experience",
  education: "Education",
  project: "Project",
  certificate: "Certificate",
  training: "Training",
  language: "Language",
  link: "Link",
};

const REMOVE_BY_KIND: Record<Kind, (id: number) => Promise<void>> = {
  skill: skillsApi.remove,
  experience: experiencesApi.remove,
  education: educationApi.remove,
  project: projectsApi.remove,
  certificate: certificatesApi.remove,
  training: trainingsApi.remove,
  language: languagesApi.remove,
  link: linksApi.remove,
};

/* ── Provenance ───────────────────────────────────────────────────── */
const SOURCE_META: Record<Source, { label: string; className?: string; style?: React.CSSProperties; dot: string }> = {
  cv: { label: "CV", className: "bg-accent-weak text-accent-text", dot: "var(--accent)" },
  github: { label: "GitHub", style: { background: "rgba(196,181,253,.14)", color: "#c4b5fd" }, dot: "#c4b5fd" },
  linkedin: { label: "LinkedIn", style: { background: "rgba(147,197,253,.14)", color: "#93c5fd" }, dot: "#93c5fd" },
  manual: { label: "Manual", className: "bg-surface-2 text-fg-mid", dot: "var(--text-low)" },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4})(?:-(\d{2}))?/.exec(iso);
  if (!m) return iso;
  const year = m[1];
  const mon = m[2];
  if (!mon) return year;
  const mi = Number(mon) - 1;
  return mi >= 0 && mi < 12 ? `${MONTHS[mi]} ${year}` : year;
}

function fmtYear(iso?: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4})/.exec(iso);
  return m ? m[1] : iso;
}

function fmtPeriod(start?: string | null, end?: string | null, current?: boolean): string {
  const s = fmtYear(start);
  const e = current ? "Now" : fmtYear(end);
  if (!s && !e) return "";
  return `${s || "?"} — ${e || "?"}`;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

/** Strip protocol + leading www + trailing slash → a short, readable label. */
function shortUrl(url: string): string {
  return url
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "");
}

/** Normalise a bare URL into an absolute href. */
function ensureHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/** True when a source is worth surfacing (external, or manual with a detail). */
function hasProvenance(source?: Source, detail?: string | null): boolean {
  return Boolean(source && (source !== "manual" || detail));
}

/** "Where it came from" line for detail / edit modals. Omitted when trivial. */
function SourceRow({ source, at, detail }: { source?: Source; at?: string | null; detail?: string | null }) {
  if (!hasProvenance(source, detail)) return null;
  const label = SOURCE_META[source ?? "manual"].label;
  const extra = [detail, at ? fmtDate(at) : null].filter(Boolean).join(" · ");
  return (
    <div className="mt-3.5 flex items-center gap-1.5 border-t border-border pt-3 text-[11px]">
      <span className="font-semibold tracking-[0.01em] text-fg-low">Source</span>
      <span className="text-fg-low">·</span>
      <span className="font-medium text-fg-mid">{label}</span>
      {extra ? <span className="truncate text-fg-low">— {extra}</span> : null}
    </div>
  );
}

/* ── Derivations for the identity / summary cards ─────────────────── */
function displayName(p: ProfileModel): string {
  const n = [p.name, p.surname].filter(Boolean).join(" ").trim();
  return n || "Your name";
}

function fieldSrc(p: ProfileModel, key: string): FieldSource | undefined {
  return p.field_sources?.[key];
}



/* ── Skill / language display maps ────────────────────────────────── */
type SkillWeight = "primary" | "strong" | "normal" | "learning";
function skillWeight(rating?: number | null): SkillWeight {
  if (!rating) return "learning";
  if (rating >= 5) return "primary";
  if (rating >= 4) return "strong";
  if (rating >= 3) return "normal";
  return "learning";
}
const SKILL_CHIP: Record<SkillWeight, { className: string; style?: React.CSSProperties }> = {
  primary: {
    className: "rounded-[9px] px-[13px] py-2 text-[14px] font-semibold text-white",
    style: { background: "var(--accent-grad)", boxShadow: "0 6px 16px -8px var(--accent-shadow)" },
  },
  strong: {
    className: "rounded-[9px] border border-border-strong bg-accent-weak px-3 py-[7px] text-[13px] font-semibold text-accent-text",
  },
  normal: { className: "rounded-[8px] border border-border bg-surface-2 px-[11px] py-1.5 text-[12px] text-fg" },
  learning: {
    className: "rounded-[8px] border border-dashed border-border-strong bg-transparent px-2.5 py-[5px] text-[11.5px] text-fg-mid",
  },
};
const LEVEL_LABEL: Record<number, string> = { 5: "Expert", 4: "Advanced", 3: "Intermediate", 2: "Basic", 1: "Beginner" };
const ratingLabel = (r?: number | null): string => (r ? LEVEL_LABEL[r] ?? `Level ${r}` : "Unrated");

const titleCase = (s: string): string => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const langLabel = (p?: LanguageLevel | null): string => (p ? titleCase(p) : "—");

/* ══════════════════════════════════════════════════════════════════
   Forms — descriptor-driven so the 8 entities share one renderer.
   ══════════════════════════════════════════════════════════════════ */
type FieldType = "text" | "textarea" | "select" | "number" | "checkbox" | "tags" | "month" | "combo";
type FieldDesc = {
  name: string;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  suggestions?: string[];
  placeholder?: string;
  required?: boolean;
  full?: boolean;
};
type FormValues = Record<string, string | boolean>;
const sv = (x: string | boolean | undefined): string => (typeof x === "string" ? x : "");

const enumOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: titleCase(v) }));
const EMPLOYMENT_OPTIONS = enumOptions(["full_time", "part_time", "internship", "freelance", "volunteer", "other"]);
const CERT_OPTIONS = enumOptions(["professional", "course", "exam", "language", "award", "bootcamp", "other"]);
const LANG_OPTIONS = enumOptions(["native", "fluent", "professional", "intermediate", "basic"]);
const RATING_OPTIONS = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} · ${LEVEL_LABEL[n]}` }));
const FORM_FIELDS: Record<Kind, FieldDesc[]> = {
  skill: [
    { name: "name", label: "Skill", type: "combo", options: toOptions(TECHNOLOGIES), required: true, placeholder: "e.g. TypeScript" },
    { name: "category", label: "Category", type: "combo", options: toOptions(SKILL_CATEGORIES), placeholder: "e.g. Languages" },
    { name: "self_rating", label: "Proficiency", type: "select", options: RATING_OPTIONS },
    { name: "years_experience", label: "Years", type: "number" },
    { name: "note", label: "Note", type: "textarea", full: true },
    { name: "description", label: "Description", type: "textarea", full: true },
  ],
  experience: [
    { name: "title", label: "Title", type: "text", required: true },
    { name: "company", label: "Company", type: "text", required: true },
    { name: "employment_type", label: "Employment type", type: "select", options: EMPLOYMENT_OPTIONS },
    { name: "location", label: "Location", type: "combo", options: toOptions(COUNTRIES), placeholder: "e.g. Turkey" },
    { name: "start_date", label: "Start", type: "month" },
    { name: "end_date", label: "End", type: "month" },
    { name: "is_current", label: "Current role", type: "checkbox" },
    { name: "description", label: "What I did", type: "textarea", full: true },
  ],
  education: [
    { name: "institution", label: "Institution", type: "combo", options: toOptions(UNIVERSITIES), required: true, placeholder: "e.g. Boğaziçi University" },
    { name: "degree", label: "Degree", type: "combo", options: toOptions(DEGREES), placeholder: "e.g. B.S." },
    { name: "field", label: "Field of study", type: "combo", options: toOptions(FIELDS_OF_STUDY), placeholder: "e.g. Computer Engineering" },
    { name: "location", label: "Location", type: "combo", options: toOptions(COUNTRIES), placeholder: "e.g. Turkey" },
    { name: "start_date", label: "Start", type: "month" },
    { name: "end_date", label: "End", type: "month" },
    { name: "is_current", label: "Currently studying", type: "checkbox" },
    { name: "gpa", label: "GPA", type: "text" },
    { name: "courses", label: "Relevant coursework", type: "tags", full: true, placeholder: "Add a course and press Enter" },
    { name: "description", label: "Description", type: "textarea", full: true },
  ],
  project: [
    { name: "name", label: "Project", type: "text", required: true },
    { name: "role", label: "Your role", type: "text" },
    { name: "technologies", label: "Technologies", type: "tags", suggestions: TECHNOLOGIES, full: true, placeholder: "Add tech — pick or type, Enter" },
    { name: "url", label: "URL", type: "text", full: true },
    { name: "start_date", label: "Start", type: "month" },
    { name: "end_date", label: "End", type: "month" },
    { name: "description", label: "Description", type: "textarea", full: true },
  ],
  certificate: [
    { name: "name", label: "Certificate", type: "text", required: true },
    { name: "issuer", label: "Issuer", type: "combo", options: toOptions(CERT_ISSUERS), placeholder: "e.g. Coursera" },
    { name: "cert_type", label: "Type", type: "select", options: CERT_OPTIONS },
    { name: "issue_date", label: "Issued", type: "month" },
    { name: "expiry_date", label: "Expires", type: "month" },
    { name: "credential_id", label: "Credential ID", type: "text" },
    { name: "url", label: "URL", type: "text", full: true },
    { name: "description", label: "Description", type: "textarea", full: true },
  ],
  training: [
    { name: "name", label: "Training", type: "text", required: true },
    { name: "provider", label: "Provider", type: "text" },
    { name: "completion_date", label: "Completed", type: "month" },
    { name: "url", label: "URL", type: "text", full: true },
    { name: "description", label: "Description", type: "textarea", full: true },
  ],
  language: [
    { name: "name", label: "Language", type: "combo", options: toOptions(LANGUAGES), required: true, placeholder: "e.g. English" },
    { name: "proficiency", label: "Proficiency", type: "select", options: LANG_OPTIONS },
    { name: "description", label: "Description", type: "textarea", full: true },
  ],
  link: [
    { name: "label", label: "Label", type: "text", required: true },
    { name: "url", label: "URL", type: "text", required: true, full: true },
    { name: "description", label: "Note", type: "textarea", full: true },
  ],
};

const IDENTITY_FIELDS: FieldDesc[] = [
  { name: "name", label: "First name", type: "text" },
  { name: "surname", label: "Last name", type: "text" },
  { name: "email", label: "Email", type: "text" },
  { name: "phone", label: "Phone", type: "text" },
  { name: "linkedin", label: "LinkedIn", type: "text", full: true },
  { name: "github", label: "GitHub", type: "text", full: true },
];

function blankValues(fields: FieldDesc[]): FormValues {
  const out: FormValues = {};
  for (const f of fields) out[f.name] = f.type === "checkbox" ? false : "";
  return out;
}

function prefill(fields: FieldDesc[], item: Record<string, unknown>): FormValues {
  const out: FormValues = {};
  for (const f of fields) {
    const raw = item[f.name];
    if (f.type === "checkbox") out[f.name] = raw === true;
    else if (f.type === "tags") out[f.name] = Array.isArray(raw) ? raw.join(", ") : "";
    else if (raw == null) out[f.name] = "";
    else out[f.name] = String(raw);
  }
  return out;
}

/** Turn form values into a JSON body, preserving hidden fields (id, provenance). */
function assemble(fields: FieldDesc[], existing: EntityItem | null, v: FormValues): Record<string, unknown> {
  const out: Record<string, unknown> = existing ? { ...(existing as unknown as Record<string, unknown>) } : {};
  for (const f of fields) {
    if (f.type === "checkbox") out[f.name] = v[f.name] === true;
    else if (f.type === "tags") out[f.name] = sv(v[f.name]).split(",").map((t) => t.trim()).filter(Boolean);
    else if (f.type === "number") {
      const s = sv(v[f.name]).trim();
      const n = Number(s);
      out[f.name] = s && !Number.isNaN(n) ? n : null;
    } else {
      const s = sv(v[f.name]).trim();
      out[f.name] = s ? s : null;
    }
  }
  return out;
}

async function persistItem(kind: Kind, existing: EntityItem | null, v: FormValues): Promise<void> {
  const body = assemble(FORM_FIELDS[kind], existing, v);
  const id = existing?.id ?? null;
  switch (kind) {
    case "skill": {
      const item = body as unknown as Skill;
      await (id ? skillsApi.update(id, item) : skillsApi.create(item));
      break;
    }
    case "experience": {
      const item = body as unknown as Experience;
      await (id ? experiencesApi.update(id, item) : experiencesApi.create(item));
      break;
    }
    case "education": {
      const item = body as unknown as Education;
      await (id ? educationApi.update(id, item) : educationApi.create(item));
      break;
    }
    case "project": {
      const item = body as unknown as Project;
      await (id ? projectsApi.update(id, item) : projectsApi.create(item));
      break;
    }
    case "certificate": {
      const item = body as unknown as Certificate;
      await (id ? certificatesApi.update(id, item) : certificatesApi.create(item));
      break;
    }
    case "training": {
      const item = body as unknown as Training;
      await (id ? trainingsApi.update(id, item) : trainingsApi.create(item));
      break;
    }
    case "language": {
      const item = body as unknown as Language;
      await (id ? languagesApi.update(id, item) : languagesApi.create(item));
      break;
    }
    case "link": {
      const item = body as unknown as Link;
      await (id ? linksApi.update(id, item) : linksApi.create(item));
      break;
    }
  }
}

function itemTitle(kind: Kind, item: EntityItem): string {
  switch (kind) {
    case "skill":
      return (item as Skill).name;
    case "experience":
      return (item as Experience).title;
    case "education":
      return (item as Education).degree || (item as Education).institution;
    case "project":
      return (item as Project).name;
    case "certificate":
      return (item as Certificate).name;
    case "training":
      return (item as Training).name;
    case "language":
      return (item as Language).name;
    case "link":
      return (item as Link).label;
  }
}

/* ══════════════════════════════════════════════════════════════════
   Page
   ══════════════════════════════════════════════════════════════════ */
type DetailRef = { kind: Kind; item: EntityItem };
type FormRef = { kind: Kind; existing: EntityItem | null };

export function Profile() {
  const [searchParams] = useSearchParams();
  const state = useAsync(loadBundle, []);
  const reload = state.reload;

  const [detail, setDetail] = useState<DetailRef | null>(null);
  const [form, setForm] = useState<FormRef | null>(null);
  const [confirm, setConfirm] = useState<DetailRef | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editIdentity, setEditIdentity] = useState(false);
  const [editSummary, setEditSummary] = useState(false);
  const [genSummary, setGenSummary] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [interviewOpen, setInterviewOpen] = useState(searchParams.get("interview") === "open");

  const bundle = state.data;

  const openAdd = (kind: Kind) => setForm({ kind, existing: null });
  const openDetail = (kind: Kind, item: EntityItem) => setDetail({ kind, item });

  const handleDelete = async () => {
    if (!confirm || confirm.item.id == null) return;
    setDeleting(true);
    try {
      await REMOVE_BY_KIND[confirm.kind](confirm.item.id);
      toast.success(`${KIND_LABEL[confirm.kind]} removed`, itemTitle(confirm.kind, confirm.item));
      setConfirm(null);
      reload();
    } catch (err) {
      toast.danger("Couldn't delete", errorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Page
      eyebrow="Workspace / Profile"
      title="Profile & Skills"
      actions={
        <>
          <Button
            variant="outline"
            size="md"
            onClick={() => setInterviewOpen(true)}
            className="border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 hover:border-indigo-500/60"
          >
            <SparkleIcon size={15} /> AI Profile Interview
          </Button>
          <Button variant="primary" size="md" onClick={() => setAiOpen(true)}>
            <SparkleIcon size={15} /> AI complete empty fields
          </Button>
        </>
      }
      bodyClassName="px-7 py-5"
    >
      <AsyncBoundary state={state} skeleton={<ProfileSkeleton />}>
        {(b) => (
          <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
            <IdentityCard profile={b.profile} onEdit={() => setEditIdentity(true)} />

            <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
              <SkillsCard skills={b.skills} onOpen={(it) => openDetail("skill", it)} onAdd={() => openAdd("skill")} />
              <ExperienceCard
                experiences={b.experiences}
                onOpen={(it) => openDetail("experience", it)}
                onAdd={() => openAdd("experience")}
              />
            </div>

            <SummaryCard profile={b.profile} onEdit={() => setEditSummary(true)} onGenerate={() => setGenSummary(true)} />

            <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
              <EducationCard
                education={b.education}
                onOpen={(it) => openDetail("education", it)}
                onAdd={() => openAdd("education")}
              />
              <LanguagesCard
                languages={b.languages}
                onOpen={(it) => openDetail("language", it)}
                onAdd={() => openAdd("language")}
              />
            </div>

            <ProjectsCard
              projects={b.projects}
              onOpen={(it) => openDetail("project", it)}
              onAdd={() => openAdd("project")}
              onGithub={() => setAiOpen(true)}
            />

            <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
              <CertificatesCard
                certificates={b.certificates}
                onOpen={(it) => openDetail("certificate", it)}
                onAdd={() => openAdd("certificate")}
              />
              <LinksCard links={b.links} onOpen={(it) => openDetail("link", it)} onAdd={() => openAdd("link")} />
            </div>

            <TrainingsCard
              trainings={b.trainings}
              onOpen={(it) => openDetail("training", it)}
              onAdd={() => openAdd("training")}
            />
          </div>
        )}
      </AsyncBoundary>

      {detail ? (
        <DetailModal
          kind={detail.kind}
          item={detail.item}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setForm({ kind: detail.kind, existing: detail.item });
            setDetail(null);
          }}
          onDelete={() => {
            setConfirm(detail);
            setDetail(null);
          }}
        />
      ) : null}

      {form ? (
        <ItemFormModal
          kind={form.kind}
          existing={form.existing}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            reload();
          }}
        />
      ) : null}

      {bundle && editIdentity ? (
        <IdentityFormModal
          profile={bundle.profile}
          onClose={() => setEditIdentity(false)}
          onSaved={() => {
            setEditIdentity(false);
            reload();
          }}
        />
      ) : null}

      {bundle && editSummary ? (
        <SummaryFormModal
          profile={bundle.profile}
          onClose={() => setEditSummary(false)}
          onSaved={() => {
            setEditSummary(false);
            reload();
          }}
        />
      ) : null}

      {bundle && genSummary ? (
        <SummaryStudioModal
          profile={bundle.profile}
          onClose={() => setGenSummary(false)}
          onSaved={() => {
            setGenSummary(false);
            reload();
          }}
          onWriteMyself={() => {
            setGenSummary(false);
            setEditSummary(true);
          }}
        />
      ) : null}

      {aiOpen ? (
        <AiCompleteModal
          onClose={() => setAiOpen(false)}
          onApplied={() => {
            setAiOpen(false);
            reload();
          }}
        />
      ) : null}

      <ProfileInterviewModal
        isOpen={interviewOpen}
        onClose={() => setInterviewOpen(false)}
        onProfileUpdated={reload}
      />

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => {
          if (!o) setConfirm(null);
        }}
        tone="danger"
        icon={<Trash2 size={22} />}
        title={confirm ? `Delete this ${KIND_LABEL[confirm.kind].toLowerCase()}?` : ""}
        description={
          confirm ? (
            <>
              <span className="font-semibold text-fg">{itemTitle(confirm.kind, confirm.item)}</span> will be permanently
              removed from your profile. This can't be undone.
            </>
          ) : undefined
        }
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </Page>
  );
}

function ProfileSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
      <div className="h-[104px] animate-pulse rounded-[12px] border border-border bg-surface" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-[220px] animate-pulse rounded-[12px] border border-border bg-surface" />
        <div className="h-[220px] animate-pulse rounded-[12px] border border-border bg-surface" />
      </div>
      <div className="flex items-center justify-center py-6 text-fg-mid">
        <Spinner size={20} />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Section shell + shared bits
   ══════════════════════════════════════════════════════════════════ */
function SectionCard({
  title,
  count,
  meta,
  headerExtra,
  onAdd,
  addLabel,
  children,
  className,
  maxBody,
  footer,
}: {
  title: string;
  count?: number;
  meta?: ReactNode;
  headerExtra?: ReactNode;
  onAdd?: () => void;
  addLabel: string;
  children: ReactNode;
  className?: string;
  /** Cap the whole card at this pixel height; the body scrolls when content is longer.
   *  Cards in the same row share a height (items-stretch) and the body flex-fills. */
  maxBody?: number;
  /** Optional fixed footer that stays below the scrolling body (e.g. a legend). */
  footer?: ReactNode;
}) {
  const scroll = typeof maxBody === "number";
  return (
    <div
      className={cn("cll-fade rounded-[12px] border border-border bg-surface px-5 py-[18px]", scroll && "flex flex-col", className)}
      style={scroll ? { maxHeight: maxBody } : undefined}
    >
      <div className="mb-4 flex shrink-0 items-center justify-between">
        <span className="text-[14px] font-semibold text-fg">
          {title}
          {typeof count === "number" ? (
            <span className="ml-1.5 font-mono text-[11.5px] font-normal text-fg-low">({count})</span>
          ) : null}
        </span>
        <div className="flex items-center gap-2.5">
          {meta ? <span className="font-mono text-[10px] text-fg-low">{meta}</span> : null}
          {headerExtra}
          {onAdd ? <AddButton title={addLabel} onClick={onAdd} /> : null}
        </div>
      </div>
      {scroll ? <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2">{children}</div> : children}
      {footer ? <div className="mt-3.5 shrink-0 border-t border-border pt-3">{footer}</div> : null}
    </div>
  );
}

function AddButton({ title, onClick, size = 26 }: { title: string; onClick: () => void; size?: number }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="flex items-center justify-center rounded-[8px] border border-border-strong bg-surface-2 text-fg-mid transition-colors hover:border-accent hover:text-accent-text"
      style={{ width: size, height: size }}
    >
      <PlusIcon size={13} strokeWidth={1.8} />
    </button>
  );
}

function EmptyPrompt({ children, onClick, minimal = false }: { children: ReactNode; onClick: () => void; minimal?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-[10px] border border-dashed border-border-strong bg-input text-center text-[12.5px] text-fg-mid transition-colors hover:border-accent",
        minimal ? "p-[18px]" : "p-5",
      )}
    >
      {children}
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Identity
   ══════════════════════════════════════════════════════════════════ */
function IdentityCard({
  profile,
  onEdit,
}: {
  profile: ProfileModel;
  onEdit: () => void;
}) {
  const { email, phone, linkedin, github } = profile;
  const noContact = !email && !phone && !linkedin && !github;
  const contactClass = "flex items-center gap-1.5 text-fg-mid transition-colors hover:text-accent-text";
  return (
    <div className="cll-fade flex items-start justify-between gap-5 rounded-[12px] border border-border bg-surface px-5 py-[18px]">
      <div className="min-w-0 flex-1">
        <div className="text-[19px] font-bold text-fg">{displayName(profile)}</div>
        <div className="mt-3 flex flex-wrap items-center gap-x-[18px] gap-y-2 text-[12px]">
          {email ? (
            <a href={`mailto:${email}`} className={cn(contactClass, "min-w-0")}>
              <Mail size={13} strokeWidth={1.6} className="shrink-0" />
              <span className="truncate">{email}</span>
            </a>
          ) : null}
          {phone ? (
            <a href={`tel:${phone}`} className={contactClass}>
              <Phone size={13} strokeWidth={1.6} className="shrink-0" />
              {phone}
            </a>
          ) : null}
          {linkedin ? (
            <a href={ensureHref(linkedin)} target="_blank" rel="noreferrer" className={cn(contactClass, "min-w-0")}>
              <Linkedin size={13} strokeWidth={1.6} className="shrink-0" />
              <span className="truncate">{shortUrl(linkedin)}</span>
            </a>
          ) : null}
          {github ? (
            <a href={ensureHref(github)} target="_blank" rel="noreferrer" className={cn(contactClass, "min-w-0")}>
              <Github size={13} strokeWidth={1.6} className="shrink-0" />
              <span className="truncate">{shortUrl(github)}</span>
            </a>
          ) : null}
          {noContact ? <span className="text-fg-low">No contact details yet</span> : null}
        </div>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="flex shrink-0 items-center gap-1.5 rounded-[9px] border border-border-strong bg-transparent px-3 py-2 text-[12px] text-fg-mid transition-colors hover:border-accent hover:text-fg"
      >
        <PencilIcon size={13} /> Edit
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Skills
   ══════════════════════════════════════════════════════════════════ */
function SkillPill({ skill, onOpen }: { skill: Skill; onOpen: (s: Skill) => void }) {
  const chip = SKILL_CHIP[skillWeight(skill.self_rating)];
  return (
    <button
      type="button"
      onClick={() => onOpen(skill)}
      className={cn("transition-transform hover:-translate-y-0.5", chip.className)}
      style={chip.style}
    >
      {skill.name}
    </button>
  );
}

/** Group skills by category — but only when categories are meaningfully populated. */
function groupSkills(skills: Skill[]): { label: string; items: Skill[] }[] | null {
  const withCat = skills.filter((s) => (s.category ?? "").trim());
  if (withCat.length < Math.max(2, skills.length * 0.5)) return null;
  const map = new Map<string, Skill[]>();
  for (const s of skills) {
    const key = (s.category ?? "").trim() || "Other";
    const list = map.get(key) ?? [];
    list.push(s);
    map.set(key, list);
  }
  return [...map.entries()].map(([label, items]) => ({ label, items }));
}

function SkillsCard({ skills, onOpen, onAdd }: { skills: Skill[]; onOpen: (s: Skill) => void; onAdd: () => void }) {
  const groups = groupSkills(skills);
  return (
    <SectionCard
      title="Skills"
      count={skills.length}
      addLabel="Add skill"
      onAdd={onAdd}
      maxBody={380}
      footer={
        skills.length ? (
          <div className="flex items-center justify-end gap-4 text-[11px] text-fg-mid">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--accent)" }} />
              Strong
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border border-border-strong bg-transparent" />
              Learning
            </span>
          </div>
        ) : undefined
      }
    >
      {skills.length === 0 ? (
        <EmptyPrompt onClick={onAdd}>
          No skills yet — <span className="font-semibold text-accent-text">add one</span> or let AI infer them from your CV.
        </EmptyPrompt>
      ) : groups ? (
        <div className="flex flex-col gap-3.5">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="mb-2 text-[10.5px] font-semibold tracking-[0.01em] text-fg-low">{g.label}</div>
              <div className="flex flex-wrap items-center gap-[7px]">
                {g.items.map((sk) => (
                  <SkillPill key={sk.id ?? sk.name} skill={sk} onOpen={onOpen} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-[7px]">
          {skills.map((sk) => (
            <SkillPill key={sk.id ?? sk.name} skill={sk} onOpen={onOpen} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Experience
   ══════════════════════════════════════════════════════════════════ */
function ExperienceCard({
  experiences,
  onOpen,
  onAdd,
}: {
  experiences: Experience[];
  onOpen: (x: Experience) => void;
  onAdd: () => void;
}) {
  return (
    <SectionCard
      title="Experience"
      count={experiences.length}
      addLabel="Add role"
      onAdd={onAdd}
      maxBody={380}
    >
      {experiences.length === 0 ? (
        <EmptyPrompt onClick={onAdd}>
          No roles yet — <span className="font-semibold text-accent-text">add your first</span>.
        </EmptyPrompt>
      ) : (
        <div className="flex flex-col">
          {experiences.map((x, i) => {
            const last = i === experiences.length - 1;
            const tags = [x.employment_type ? titleCase(x.employment_type) : "", x.location ?? ""].filter(Boolean);
            return (
              <button
                key={x.id ?? i}
                type="button"
                onClick={() => onOpen(x)}
                className="flex gap-3.5 rounded-[10px] px-2 py-[11px] text-left transition-colors hover:bg-surface-2"
              >
                <div className="flex shrink-0 flex-col items-center pt-1">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      background: "var(--accent)",
                      boxShadow: x.is_current ? "0 0 8px var(--accent)" : undefined,
                      opacity: x.is_current ? 1 : 0.6,
                    }}
                  />
                  {!last ? <span className="mt-1.5 min-h-[14px] w-px flex-1 bg-border" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2.5">
                    <span className="text-[13.5px] font-semibold leading-tight text-fg">{x.title}</span>
                    <span className="shrink-0 text-[10.5px] tabular-nums text-fg-low">
                      {fmtPeriod(x.start_date, x.end_date, x.is_current)}
                    </span>
                  </div>
                  <div className="mt-1 text-[12px] text-accent-text">{x.company}</div>
                  {tags.length ? (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {tags.map((t) => (
                        <span key={t} className="rounded-[6px] border border-border bg-input px-2 py-0.5 text-[10px] text-fg-mid">
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {x.description ? (
                    <div className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-fg-mid">{x.description}</div>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Summary
   ══════════════════════════════════════════════════════════════════ */
function SummaryCard({
  profile,
  onEdit,
  onGenerate,
}: {
  profile: ProfileModel;
  onEdit: () => void;
  onGenerate: () => void;
}) {
  const summary = profile.summary?.trim() ?? "";
  const words = summary ? summary.split(/\s+/).length : 0;
  return (
    <div className="cll-fade rounded-[12px] border border-border bg-surface px-5 py-[18px]">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[14px] font-semibold text-fg">Summary</span>
        {summary ? (
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1.5 rounded-[8px] border border-border-strong bg-transparent px-2.5 py-1.5 text-[11.5px] text-fg-mid transition-colors hover:border-accent hover:text-fg"
          >
            <PencilIcon size={12} /> Edit
          </button>
        ) : (
          <span className="rounded-full border border-dashed border-border-strong px-2 py-0.5 text-[10.5px] font-semibold tracking-[0.01em] text-fg-low">
            Empty
          </span>
        )}
      </div>
      {summary ? (
        <>
          <div className="mt-3 max-w-[68ch] text-[13.5px] leading-[1.85] text-fg-mid">{summary}</div>
          <div className="mt-3 flex items-center gap-1.5">
            <span className="rounded-[6px] bg-input px-2 py-0.5 font-mono text-[9px] text-fg-low">{words} words</span>
          </div>
        </>
      ) : (
        <div className="mt-2.5 flex items-center justify-between gap-4 rounded-[10px] border border-dashed border-border-strong bg-input p-4">
          <div className="text-[13px] text-fg-mid">
            <span className="font-semibold text-accent-text">AI can draft this from your CV.</span> A short professional
            summary grounded in your experience.
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="primary" size="sm" onClick={onGenerate}>
              <SparkleIcon size={13} /> Generate
            </Button>
            <button
              type="button"
              onClick={onEdit}
              className="rounded-[9px] border border-border-strong bg-transparent px-3.5 py-2 text-[12px] text-fg-mid transition-colors hover:border-accent hover:text-fg"
            >
              Write myself
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Education
   ══════════════════════════════════════════════════════════════════ */
function eduMeta(ed: Education): string {
  const period = fmtPeriod(ed.start_date, ed.end_date, ed.is_current);
  return [period, ed.gpa ? `GPA ${ed.gpa}` : ""].filter(Boolean).join(" · ");
}
function EducationCard({
  education,
  onOpen,
  onAdd,
}: {
  education: Education[];
  onOpen: (e: Education) => void;
  onAdd: () => void;
}) {
  return (
    <SectionCard title="Education" count={education.length} addLabel="Add education" onAdd={onAdd} maxBody={380}>
      {education.length === 0 ? (
        <EmptyPrompt minimal onClick={onAdd}>
          No education yet — <span className="font-semibold text-accent-text">add a degree</span>.
        </EmptyPrompt>
      ) : (
        <div className="flex flex-col gap-2.5">
          {education.map((ed, i) => (
            <button
              key={ed.id ?? i}
              type="button"
              onClick={() => onOpen(ed)}
              className="flex gap-3 rounded-[10px] border border-border bg-surface-2 p-[11px] text-left transition-colors hover:border-accent"
            >
              <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-accent-weak text-accent-text">
                <CapIcon size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-fg">
                  {[ed.degree, ed.field].filter(Boolean).join(" · ") || "Studies"}
                </div>
                <div className="mt-0.5 truncate text-[12px] text-fg-mid">{ed.institution}</div>
                {eduMeta(ed) ? <div className="mt-1 font-mono text-[11px] text-fg-low">{eduMeta(ed)}</div> : null}
                {ed.courses && ed.courses.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ed.courses.map((c) => (
                      <span key={c} className="rounded-[6px] bg-input px-2 py-[3px] font-mono text-[9px] text-fg-mid">
                        {c}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Languages
   ══════════════════════════════════════════════════════════════════ */
function LanguagesCard({
  languages,
  onOpen,
  onAdd,
}: {
  languages: Language[];
  onOpen: (l: Language) => void;
  onAdd: () => void;
}) {
  return (
    <SectionCard title="Languages" count={languages.length} addLabel="Add language" onAdd={onAdd} maxBody={380}>
      {languages.length === 0 ? (
        <EmptyPrompt minimal onClick={onAdd}>
          No languages yet — <span className="font-semibold text-accent-text">add one</span>.
        </EmptyPrompt>
      ) : (
        <div className="flex flex-col gap-0.5">
          {languages.map((lg, i) => (
            <button
              key={lg.id ?? i}
              type="button"
              onClick={() => onOpen(lg)}
              className="flex items-center justify-between gap-3 rounded-[9px] px-2 py-2.5 text-left transition-colors hover:bg-surface-2"
            >
              <span className="min-w-0 truncate text-[13px] text-fg">{lg.name}</span>
              <span className="shrink-0 text-[12px] font-medium text-accent-text">{langLabel(lg.proficiency)}</span>
            </button>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Projects
   ══════════════════════════════════════════════════════════════════ */
function ProjectsCard({
  projects,
  onOpen,
  onAdd,
  onGithub,
}: {
  projects: Project[];
  onOpen: (p: Project) => void;
  onAdd: () => void;
  onGithub: () => void;
}) {
  return (
    <SectionCard
      title="Projects"
      count={projects.length}
      addLabel="Add project"
      onAdd={onAdd}
      maxBody={600}
      headerExtra={
        <button
          type="button"
          onClick={onGithub}
          className="flex items-center gap-1.5 rounded-[9px] border border-border-strong bg-surface-2 px-3 py-1.5 text-[12px] text-fg transition-colors hover:border-accent"
        >
          <BranchIcon size={13} strokeWidth={1.4} /> Add from GitHub
        </button>
      }
    >
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
        {projects.map((p, i) => {
          const period = fmtPeriod(p.start_date, p.end_date);
          const tech = p.technologies ?? [];
          return (
            <button
              key={p.id ?? i}
              type="button"
              onClick={() => onOpen(p)}
              className="flex flex-col rounded-[11px] border border-border bg-surface-2 p-3.5 text-left transition-colors hover:border-accent"
            >
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-accent-text">
                  <BranchIcon size={14} strokeWidth={1.5} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">{p.name}</span>
                <div className="flex shrink-0 items-center gap-1.5">
                  {typeof p.stars === "number" ? (
                    <span className="flex items-center gap-0.5 font-mono text-[10px] text-warning" title={`${p.stars} stars`}>
                      <StarIcon size={11} strokeWidth={1.6} />
                      {p.stars}
                    </span>
                  ) : null}
                  {p.role ? (
                    <span className="max-w-[120px] truncate rounded-[6px] bg-accent-weak px-2 py-0.5 font-mono text-[9px] text-accent-text">
                      {p.role}
                    </span>
                  ) : null}
                </div>
              </div>
              {period ? <div className="mt-1 font-mono text-[10px] text-fg-low">{period}</div> : null}
              {p.description ? (
                <div className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-fg-mid">{p.description}</div>
              ) : null}
              {tech.length ? (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {tech.map((t) => (
                    <span
                      key={t}
                      className="flex max-w-full items-center gap-1.5 rounded-[6px] bg-input px-2 py-[3px] font-mono text-[9px] text-fg-mid"
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                      <span className="truncate">{t}</span>
                    </span>
                  ))}
                </div>
              ) : null}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onAdd}
          className="flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-border-strong bg-input p-3.5 text-center transition-colors hover:border-accent"
        >
          <PlusIcon size={18} strokeWidth={1.6} className="text-accent" />
          <span className="text-[12.5px] text-fg-mid">Add a project manually</span>
        </button>
      </div>
    </SectionCard>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Certificates
   ══════════════════════════════════════════════════════════════════ */
function CertificatesCard({
  certificates,
  onOpen,
  onAdd,
}: {
  certificates: Certificate[];
  onOpen: (c: Certificate) => void;
  onAdd: () => void;
}) {
  return (
    <SectionCard title="Certificates" count={certificates.length} addLabel="Add certificate" onAdd={onAdd} maxBody={380}>
      {certificates.length === 0 ? (
        <EmptyPrompt minimal onClick={onAdd}>
          No certificates yet — <span className="font-semibold text-accent-text">add one</span>.
        </EmptyPrompt>
      ) : (
        <div className="flex flex-col gap-0.5">
          {certificates.map((ct, i) => (
            <button
              key={ct.id ?? i}
              type="button"
              onClick={() => onOpen(ct)}
              className="flex items-center gap-3 rounded-[8px] p-2 text-left text-[13px] transition-colors hover:bg-surface-2"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-accent-weak text-accent-text">
                <AwardIcon size={15} />
              </span>
              <span className="min-w-0 flex-1 truncate text-fg">{ct.name}</span>
              {ct.issuer ? <span className="shrink-0 truncate font-mono text-[10px] text-fg-low">{ct.issuer}</span> : null}
              {ct.issue_date ? (
                <span className="shrink-0 font-mono text-[10px] text-fg-low">{fmtDate(ct.issue_date)}</span>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Trainings
   ══════════════════════════════════════════════════════════════════ */
function TrainingsCard({
  trainings,
  onOpen,
  onAdd,
}: {
  trainings: Training[];
  onOpen: (t: Training) => void;
  onAdd: () => void;
}) {
  return (
    <SectionCard
      title="Trainings"
      count={trainings.length}
      addLabel="Add training"
      onAdd={onAdd}
      maxBody={380}
    >
      {trainings.length === 0 ? (
        <EmptyPrompt minimal onClick={onAdd}>
          No trainings yet — <span className="font-semibold text-accent-text">add one</span>.
        </EmptyPrompt>
      ) : (
        <div className="flex flex-col gap-0.5">
          {trainings.map((tr, i) => (
            <button
              key={tr.id ?? i}
              type="button"
              onClick={() => onOpen(tr)}
              className="flex items-center gap-3 rounded-[8px] p-2 text-left transition-colors hover:bg-surface-2"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-accent-weak text-accent-text">
                <BookIcon size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] text-fg">{tr.name}</div>
                {tr.provider ? <div className="truncate font-mono text-[11px] text-fg-low">{tr.provider}</div> : null}
              </div>
              {tr.completion_date ? (
                <span className="shrink-0 font-mono text-[10px] text-fg-low">{fmtDate(tr.completion_date)}</span>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Links
   ══════════════════════════════════════════════════════════════════ */
/** Brand glyph inferred from a link's url/label. */
function LinkGlyph({ url, label }: { url: string; label: string }) {
  const s = `${url} ${label}`.toLowerCase();
  const p = { size: 15, strokeWidth: 1.7 } as const;
  if (s.includes("github")) return <Github {...p} />;
  if (s.includes("linkedin")) return <Linkedin {...p} />;
  if (s.includes("gitlab")) return <Gitlab {...p} />;
  if (s.includes("twitter") || s.includes("x.com")) return <Twitter {...p} />;
  if (s.includes("youtube") || s.includes("youtu.be")) return <Youtube {...p} />;
  if (s.includes("instagram")) return <Instagram {...p} />;
  return <Globe {...p} />;
}

function LinksCard({ links, onOpen, onAdd }: { links: Link[]; onOpen: (l: Link) => void; onAdd: () => void }) {
  return (
    <SectionCard title="Links" count={links.length} addLabel="Add link" onAdd={onAdd} maxBody={380}>
      {links.length === 0 ? (
        <EmptyPrompt minimal onClick={onAdd}>
          No links yet — <span className="font-semibold text-accent-text">add one</span>.
        </EmptyPrompt>
      ) : (
        <div className="flex flex-col gap-0.5">
          {links.map((ln, i) => (
            <button
              key={ln.id ?? i}
              type="button"
              onClick={() => onOpen(ln)}
              className="group flex items-center gap-3 rounded-[10px] px-2.5 py-2 text-left transition-colors hover:bg-surface-2"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-border bg-surface-2 text-fg-mid transition-colors group-hover:border-border-strong group-hover:text-accent-text">
                <LinkGlyph url={ln.url} label={ln.label} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-medium text-fg">{ln.label}</div>
                <div className="truncate font-mono text-[11px] text-fg-low">{shortUrl(ln.url)}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Modal shell (shared Radix Dialog, styled to the design)
   ══════════════════════════════════════════════════════════════════ */
const WIDTH_CLASS: Record<number, string> = {
  420: "w-[min(92vw,420px)]",
  440: "w-[min(92vw,440px)]",
  460: "w-[min(92vw,460px)]",
  520: "w-[min(92vw,520px)]",
  560: "w-[min(92vw,560px)]",
};

function ModalShell({
  onClose,
  width = 440,
  title,
  children,
}: {
  onClose: () => void;
  width?: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        showClose={false}
        className={cn("max-w-none overflow-hidden rounded-[13px] p-0", WIDTH_CLASS[width] ?? WIDTH_CLASS[440])}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function ModalHeader({ icon, kicker, title }: { icon: ReactNode; kicker: string; title: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-5 py-4">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] text-on-accent"
        style={{ background: "var(--accent-grad)", boxShadow: "0 8px 20px -10px var(--accent-shadow)" }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] font-semibold tracking-[0.02em] text-fg-low">{kicker}</div>
        <div className="truncate text-[15.5px] font-bold text-fg">{title}</div>
      </div>
    </div>
  );
}

function DetailFooter({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-between border-t border-border bg-surface-2 px-4 py-3">
      <button
        type="button"
        onClick={onDelete}
        className="rounded-[9px] border px-3 py-1.5 text-[12px] text-danger transition-colors hover:bg-danger-weak"
        style={{ borderColor: "rgba(251,113,133,.32)" }}
      >
        Delete
      </button>
      <Button variant="primary" size="sm" onClick={onEdit}>
        Edit
      </Button>
    </div>
  );
}

const KIND_ICON: Record<Kind, ReactNode> = {
  skill: <SparkleIcon size={17} />,
  experience: <BriefcaseIcon size={17} />,
  education: <CapIcon size={17} />,
  project: <BranchIcon size={17} strokeWidth={1.5} />,
  certificate: <AwardIcon size={17} />,
  training: <BookIcon size={17} />,
  language: <GlobeIcon size={17} />,
  link: <LinkIcon size={17} strokeWidth={1.6} />,
};

/* ══════════════════════════════════════════════════════════════════
   Item detail modal
   ══════════════════════════════════════════════════════════════════ */
function DetailModal({
  kind,
  item,
  onClose,
  onEdit,
  onDelete,
}: {
  kind: Kind;
  item: EntityItem;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <ModalShell onClose={onClose} width={kind === "experience" || kind === "project" ? 460 : 420} title={itemTitle(kind, item)}>
      <ModalHeader icon={KIND_ICON[kind]} kicker={KIND_LABEL[kind]} title={itemTitle(kind, item)} />
      <div className="p-5">{renderDetailBody(kind, item)}</div>
      <DetailFooter onEdit={onEdit} onDelete={onDelete} />
    </ModalShell>
  );
}

function renderDetailBody(kind: Kind, item: EntityItem): ReactNode {
  const prov = (it: { source?: Source; source_at?: string | null; source_detail?: string | null }) => (
    <SourceRow source={it.source} at={it.source_at} detail={it.source_detail} />
  );
  switch (kind) {
    case "skill": {
      const sk = item as Skill;
      const level = sk.self_rating ?? 0;
      return (
        <>
          <div className="mb-4 flex items-center gap-2">
            {sk.category ? (
              <span className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-[10.5px] text-fg-mid">
                {sk.category}
              </span>
            ) : null}
            {typeof sk.years_experience === "number" ? (
              <span className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-[10.5px] text-fg-mid">
                {sk.years_experience} yrs
              </span>
            ) : null}
          </div>
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-[10.5px] font-semibold tracking-[0.01em] text-fg-low">Proficiency</span>
            <span className="text-[12px] font-semibold text-accent-text">{ratingLabel(sk.self_rating)}</span>
          </div>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} className="h-2 flex-1 rounded-[4px]" style={{ background: n <= level ? "var(--accent-grad)" : "var(--input)" }} />
            ))}
          </div>
          {sk.note || sk.description ? (
            <div className="mt-3.5 rounded-[10px] bg-reading px-3.5 py-3 text-[12.5px] leading-relaxed text-reading-ink">
              {sk.description || sk.note}
            </div>
          ) : null}
          {prov(sk)}
        </>
      );
    }
    case "experience": {
      const x = item as Experience;
      const tags = [x.employment_type ? titleCase(x.employment_type) : "", x.location ?? ""].filter(Boolean);
      return (
        <>
          <div className="text-[12.5px] font-semibold text-accent-text">{x.company}</div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {fmtPeriod(x.start_date, x.end_date, x.is_current) ? (
              <span className="rounded-[8px] bg-accent-weak px-2.5 py-1 text-[11px] text-accent-text">
                {fmtPeriod(x.start_date, x.end_date, x.is_current)}
              </span>
            ) : null}
            {tags.map((t) => (
              <span key={t} className="rounded-[8px] border border-border bg-surface-2 px-2.5 py-1 text-[11px] text-fg-mid">
                {t}
              </span>
            ))}
          </div>
          {x.description ? (
            <div className="mt-3.5 border-t border-border pt-3.5">
              <div className="mb-2 text-[10.5px] font-semibold tracking-[0.01em] text-fg-low">What I did</div>
              <div className="rounded-[10px] bg-reading px-3.5 py-3 text-[12.5px] leading-relaxed text-reading-ink">
                {x.description}
              </div>
            </div>
          ) : null}
          {prov(x)}
        </>
      );
    }
    case "project": {
      const p = item as Project;
      return (
        <>
          <div className="flex items-center gap-2">
            {p.role ? (
              <span className="rounded-full bg-accent-weak px-2.5 py-0.5 font-mono text-[9px] text-accent-text">{p.role}</span>
            ) : null}
            {fmtPeriod(p.start_date, p.end_date) ? (
              <span className="ml-auto font-mono text-[10px] text-fg-low">{fmtPeriod(p.start_date, p.end_date)}</span>
            ) : null}
          </div>
          {p.description ? (
            <div className="mt-3 rounded-[10px] bg-reading px-3.5 py-3 text-[12.5px] leading-relaxed text-reading-ink">
              {p.description}
            </div>
          ) : null}
          {(p.technologies ?? []).length ? (
            <div className="mt-3.5 flex flex-wrap gap-1.5">
              {(p.technologies ?? []).map((t) => (
                <span key={t} className="rounded-[7px] border border-border bg-surface-2 px-2 py-1 font-mono text-[9px] text-fg-mid">
                  {t}
                </span>
              ))}
            </div>
          ) : null}
          {p.url ? <DetailLink url={p.url} /> : null}
          {prov(p)}
        </>
      );
    }
    case "education": {
      const ed = item as Education;
      const chips = [
        fmtPeriod(ed.start_date, ed.end_date, ed.is_current),
        ed.field ?? "",
        ed.location ?? "",
        ed.gpa ? `GPA ${ed.gpa}` : "",
      ].filter(Boolean);
      return (
        <>
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-semibold text-accent-text">{ed.institution}</span>
          </div>
          {chips.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {chips.map((m) => (
                <span key={m} className="rounded-[8px] border border-border bg-surface-2 px-2.5 py-1 text-[11px] text-fg-mid">
                  {m}
                </span>
              ))}
            </div>
          ) : null}
          {ed.description ? (
            <div className="mt-3 rounded-[10px] bg-reading px-3.5 py-3 text-[12.5px] leading-relaxed text-reading-ink">
              {ed.description}
            </div>
          ) : null}
          {prov(ed)}
        </>
      );
    }
    case "language": {
      const lg = item as Language;
      return (
        <>
          <div className="flex items-center justify-between rounded-[10px] border border-border bg-surface-2 px-3.5 py-3">
            <span className="text-[10.5px] font-semibold tracking-[0.01em] text-fg-low">Proficiency</span>
            <span className="text-[13px] font-semibold text-accent-text">{langLabel(lg.proficiency)}</span>
          </div>
          {lg.description ? (
            <div className="mt-3 rounded-[10px] bg-reading px-3.5 py-3 text-[12.5px] leading-relaxed text-reading-ink">
              {lg.description}
            </div>
          ) : null}
          {prov(lg)}
        </>
      );
    }
    case "certificate": {
      const ct = item as Certificate;
      const chips = [
        ct.cert_type ? titleCase(ct.cert_type) : "",
        ct.issue_date ? `Issued ${fmtDate(ct.issue_date)}` : "",
        ct.expiry_date ? `Expires ${fmtDate(ct.expiry_date)}` : "",
        ct.credential_id ? `ID ${ct.credential_id}` : "",
      ].filter(Boolean);
      return (
        <>
          {ct.issuer ? (
            <div className="flex items-center justify-between rounded-[10px] border border-border bg-surface-2 px-3.5 py-3">
              <div>
                <div className="text-[10.5px] font-semibold tracking-[0.01em] text-fg-low">Issuer</div>
                <div className="mt-0.5 text-[13px] font-semibold text-fg">{ct.issuer}</div>
              </div>
            </div>
          ) : null}
          {chips.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {chips.map((m) => (
                <span key={m} className="rounded-[8px] bg-accent-weak px-2.5 py-1 text-[11px] text-accent-text">
                  {m}
                </span>
              ))}
            </div>
          ) : null}
          {ct.description ? (
            <div className="mt-3 rounded-[10px] bg-reading px-3.5 py-3 text-[12.5px] leading-relaxed text-reading-ink">
              {ct.description}
            </div>
          ) : null}
          {ct.url ? <DetailLink url={ct.url} /> : null}
          {prov(ct)}
        </>
      );
    }
    case "training": {
      const tr = item as Training;
      return (
        <>
          {tr.provider ? (
            <div className="flex items-center justify-between rounded-[10px] border border-border bg-surface-2 px-3.5 py-3">
              <div>
                <div className="text-[10.5px] font-semibold tracking-[0.01em] text-fg-low">Provider</div>
                <div className="mt-0.5 text-[13px] font-semibold text-fg">{tr.provider}</div>
              </div>
            </div>
          ) : null}
          {tr.completion_date ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="rounded-[8px] bg-accent-weak px-2.5 py-1 text-[11px] text-accent-text">
                Completed {fmtDate(tr.completion_date)}
              </span>
            </div>
          ) : null}
          {tr.description ? (
            <div className="mt-3 rounded-[10px] bg-reading px-3.5 py-3 text-[12.5px] leading-relaxed text-reading-ink">
              {tr.description}
            </div>
          ) : null}
          {tr.url ? <DetailLink url={tr.url} /> : null}
          {prov(tr)}
        </>
      );
    }
    case "link": {
      const ln = item as Link;
      return (
        <>
          {ln.description ? <div className="mb-3 text-[12.5px] leading-relaxed text-fg-mid">{ln.description}</div> : null}
          <DetailLink url={ln.url} mono />
          {prov(ln)}
        </>
      );
    }
  }
}

/** External-link row used across detail bodies. */
function DetailLink({ url, mono = false }: { url: string; mono?: boolean }) {
  const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "mt-3.5 flex items-center justify-center gap-1.5 rounded-[9px] border border-border-strong bg-surface-2 py-2.5 text-[12px] text-accent-text transition-colors hover:border-accent",
        mono && "font-mono",
      )}
    >
      <LinkIcon size={13} strokeWidth={1.6} /> {url}
    </a>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Forms
   ══════════════════════════════════════════════════════════════════ */
function FormGrid({
  fields,
  values,
  onChange,
}: {
  fields: FieldDesc[];
  values: FormValues;
  onChange: (name: string, value: string | boolean) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
      {fields.map((f) => {
        const span = f.full || f.type === "textarea" ? "sm:col-span-2" : "";
        if (f.type === "checkbox") {
          return (
            <label key={f.name} className={cn("flex items-center justify-between gap-3 rounded-[9px] border border-border bg-input px-3 py-2.5", span)}>
              <span className="text-[10.5px] font-semibold tracking-[0.01em] text-fg-mid">{f.label}</span>
              <Toggle checked={values[f.name] === true} onChange={(c) => onChange(f.name, c)} aria-label={f.label} />
            </label>
          );
        }
        return (
          <div key={f.name} className={span}>
            <Field label={f.label}>
              {f.type === "textarea" ? (
                <Textarea
                  value={sv(values[f.name])}
                  placeholder={f.placeholder}
                  onChange={(e) => onChange(f.name, e.target.value)}
                />
              ) : f.type === "select" ? (
                <SearchSelect value={sv(values[f.name])} options={f.options ?? []} onChange={(v) => onChange(f.name, v)} />
              ) : f.type === "month" ? (
                <DateField value={sv(values[f.name])} onChange={(v) => onChange(f.name, v)} />
              ) : f.type === "combo" ? (
                <SearchSelect
                  value={sv(values[f.name])}
                  options={f.options ?? []}
                  onChange={(v) => onChange(f.name, v)}
                  placeholder={f.placeholder ?? "Select or type…"}
                  allowCustom
                />
              ) : f.type === "tags" ? (
                <TagField
                  value={sv(values[f.name])}
                  onChange={(v) => onChange(f.name, v)}
                  suggestions={f.suggestions}
                  placeholder={f.placeholder ?? "Type and press Enter"}
                />
              ) : (
                <Input
                  type={f.type === "number" ? "number" : "text"}
                  value={sv(values[f.name])}
                  placeholder={f.placeholder}
                  onChange={(e) => onChange(f.name, e.target.value)}
                />
              )}
            </Field>
          </div>
        );
      })}
    </div>
  );
}

function ModalFooter({
  onCancel,
  saving,
  submitLabel,
}: {
  onCancel: () => void;
  saving: boolean;
  submitLabel: string;
}) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-2 px-4 py-3">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-[9px] border border-border-strong bg-transparent px-3.5 py-2 text-[12px] text-fg-mid transition-colors hover:border-accent hover:text-fg"
      >
        Cancel
      </button>
      <Button type="submit" variant="primary" size="sm" loading={saving}>
        {submitLabel}
      </Button>
    </div>
  );
}

function ItemFormModal({
  kind,
  existing,
  onClose,
  onSaved,
}: {
  kind: Kind;
  existing: EntityItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fields = FORM_FIELDS[kind];
  const [values, setValues] = useState<FormValues>(() =>
    existing ? prefill(fields, existing as unknown as Record<string, unknown>) : blankValues(fields),
  );
  const [saving, setSaving] = useState(false);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    for (const f of fields) {
      if (f.required && !sv(values[f.name]).trim()) {
        toast.warning("Missing field", `${f.label} is required.`);
        return;
      }
    }
    setSaving(true);
    try {
      await persistItem(kind, existing, values);
      toast.success(existing ? `${KIND_LABEL[kind]} updated` : `${KIND_LABEL[kind]} added`);
      onSaved();
    } catch (err) {
      toast.danger("Couldn't save", errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={onClose} width={520} title={`${existing ? "Edit" : "Add"} ${KIND_LABEL[kind].toLowerCase()}`}>
      <form onSubmit={submit}>
        <ModalHeader
          icon={KIND_ICON[kind]}
          kicker={`${existing ? "Edit" : "Add"} · ${KIND_LABEL[kind]}`}
          title={existing ? itemTitle(kind, existing) : `New ${KIND_LABEL[kind].toLowerCase()}`}
        />
        <div className="max-h-[62vh] overflow-y-auto p-5">
          <FormGrid fields={fields} values={values} onChange={(name, value) => setValues((v) => ({ ...v, [name]: value }))} />
        </div>
        <ModalFooter onCancel={onClose} saving={saving} submitLabel={existing ? "Save changes" : "Add"} />
      </form>
    </ModalShell>
  );
}

function IdentityFormModal({
  profile,
  onClose,
  onSaved,
}: {
  profile: ProfileModel;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<FormValues>(() => prefill(IDENTITY_FIELDS, profile as unknown as Record<string, unknown>));
  const [saving, setSaving] = useState(false);
  const identitySrc = fieldSrc(profile, "name") ?? fieldSrc(profile, "email");

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setSaving(true);
    try {
      const next: ProfileModel = { ...profile };
      const field_sources: Record<string, FieldSource> = { ...(profile.field_sources ?? {}) };
      const today = todayISO();
      for (const f of IDENTITY_FIELDS) {
        const value = sv(values[f.name]).trim() || null;
        const prev = (profile as unknown as Record<string, unknown>)[f.name] ?? null;
        (next as unknown as Record<string, unknown>)[f.name] = value;
        if (value !== prev) field_sources[f.name] = { source: "manual", detail: null, at: today };
      }
      next.field_sources = field_sources;
      await saveProfile(next);
      toast.success("Identity saved");
      onSaved();
    } catch (err) {
      toast.danger("Couldn't save", errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={onClose} width={520} title="Edit identity">
      <form onSubmit={submit}>
        <ModalHeader icon={<PencilIcon size={17} />} kicker="Edit · Identity" title="Your details" />
        <div className="max-h-[62vh] overflow-y-auto p-5">
          <FormGrid fields={IDENTITY_FIELDS} values={values} onChange={(name, value) => setValues((v) => ({ ...v, [name]: value }))} />
          <SourceRow source={identitySrc?.source} at={identitySrc?.at} detail={identitySrc?.detail} />
        </div>
        <ModalFooter onCancel={onClose} saving={saving} submitLabel="Save changes" />
      </form>
    </ModalShell>
  );
}

function SummaryFormModal({
  profile,
  onClose,
  onSaved,
}: {
  profile: ProfileModel;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState(profile.summary ?? "");
  const [saving, setSaving] = useState(false);
  const summarySrc = fieldSrc(profile, "summary");

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setSaving(true);
    try {
      const value = text.trim() || null;
      const field_sources: Record<string, FieldSource> = { ...(profile.field_sources ?? {}) };
      if (value !== (profile.summary ?? null)) field_sources.summary = { source: "manual", detail: null, at: todayISO() };
      await saveProfile({ ...profile, summary: value, field_sources });
      toast.success("Summary saved");
      onSaved();
    } catch (err) {
      toast.danger("Couldn't save", errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={onClose} width={520} title="Edit summary">
      <form onSubmit={submit}>
        <ModalHeader icon={<PencilIcon size={17} />} kicker="Edit · Summary" title="Professional summary" />
        <div className="p-4">
          <Field label="Summary" hint="A short professional summary, grounded in your experience.">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[140px]" />
          </Field>
          <SourceRow source={summarySrc?.source} at={summarySrc?.at} detail={summarySrc?.detail} />
        </div>
        <ModalFooter onCancel={onClose} saving={saving} submitLabel="Save changes" />
      </form>
    </ModalShell>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Summary AI studio — streams a grounded draft, tone chips refine it.
   ══════════════════════════════════════════════════════════════════ */
const SUMMARY_TONES: { label: string; instruction: string }[] = [
  { label: "Concise", instruction: "Make it more concise." },
  { label: "Technical", instruction: "Make it more technical and specific." },
  { label: "Warmer", instruction: "Make it warmer and more personable." },
];

function SummaryStudioModal({
  profile,
  onClose,
  onSaved,
  onWriteMyself,
}: {
  profile: ProfileModel;
  onClose: () => void;
  onSaved: () => void;
  onWriteMyself: () => void;
}) {
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [saving, setSaving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback((stream: (onEvent: (e: DraftEvent) => void, signal: AbortSignal) => Promise<void>) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setText("");
    setStreaming(true);
    stream((e) => {
      if (e.type === "token") setText((t) => t + e.text);
      else if (e.type === "done") {
        if (e.text) setText(e.text);
        setStreaming(false);
      } else {
        setStreaming(false);
        toast.danger("Draft failed", e.error);
      }
    }, ctrl.signal).catch((err) => {
      if (!ctrl.signal.aborted) {
        setStreaming(false);
        toast.danger("Draft failed", errorMessage(err));
      }
    });
  }, []);

  useEffect(() => {
    run((onEvent, signal) => streamDraft({ field_label: "Professional summary" }, onEvent, signal));
    return () => abortRef.current?.abort();
  }, [run]);

  const refine = (instruction: string) => {
    if (streaming || !text.trim()) return;
    const current = text;
    run((onEvent, signal) => streamRefine({ field_label: "Professional summary", current, instruction }, onEvent, signal));
  };

  const save = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const field_sources: Record<string, FieldSource> = {
        ...(profile.field_sources ?? {}),
        summary: { source: "manual", detail: "AI-assisted", at: todayISO() },
      };
      await saveProfile({ ...profile, summary: text.trim(), field_sources });
      toast.success("Summary saved");
      onSaved();
    } catch (err) {
      toast.danger("Couldn't save", errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={onClose} width={460} title="Generate summary">
      <div className="flex items-center gap-3 border-b border-border px-4 py-4">
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] text-white" style={{ background: "var(--accent-grad)" }}>
          <SparkleIcon size={16} strokeWidth={1.6} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-fg">Generate summary</div>
          <div className="text-[10.5px] text-fg-mid">Drafted from your CV & GitHub — grounded, nothing invented.</div>
        </div>
        {streaming ? (
          <Pill tone="accent" mono dot>
            Writing
          </Pill>
        ) : null}
      </div>
      <div className="p-4">
        <div className="min-h-[96px] rounded-[10px] border border-border bg-reading px-3.5 py-3.5 text-[12.5px] leading-relaxed text-reading-ink">
          {text}
          {streaming ? <span className="cll-caret" /> : null}
          {!text && !streaming ? <span className="text-fg-low">Nothing drafted yet.</span> : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SUMMARY_TONES.map((t) => (
            <button
              key={t.label}
              type="button"
              disabled={streaming || !text.trim()}
              onClick={() => refine(t.instruction)}
              className="rounded-[8px] border border-border-strong bg-surface-2 px-2.5 py-1.5 text-[11px] text-fg transition-colors hover:border-accent disabled:opacity-45"
            >
              {t.label}
            </button>
          ))}
          <button
            type="button"
            disabled={streaming}
            onClick={() => run((onEvent, signal) => streamDraft({ field_label: "Professional summary" }, onEvent, signal))}
            className="rounded-[8px] border border-border-strong bg-surface-2 px-2.5 py-1.5 text-[11px] text-fg transition-colors hover:border-accent disabled:opacity-45"
          >
            Regenerate
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-border bg-surface-2 px-4 py-3">
        <button
          type="button"
          onClick={onWriteMyself}
          className="rounded-[9px] border border-border-strong px-3 py-1.5 text-[12px] text-fg-mid transition-colors hover:border-accent hover:text-fg"
        >
          Write myself
        </button>
        <Button variant="primary" size="sm" loading={saving} disabled={streaming || !text.trim()} onClick={save}>
          Use this
        </Button>
      </div>
    </ModalShell>
  );
}

/* ══════════════════════════════════════════════════════════════════
   AI complete empty fields — plan → stream suggestions → apply
   ══════════════════════════════════════════════════════════════════ */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function asInt(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;
}

function previewValue(step: CompletionStep, value: unknown): string {
  if (step.kind === "languages") {
    if (Array.isArray(value)) {
      const names = value.map((l) => (isRecord(l) ? asString(l.name) : null)).filter(Boolean) as string[];
      return names.join(", ") || "—";
    }
    return "—";
  }
  if (step.kind === "skills") {
    if (isRecord(value)) {
      const cats = isRecord(value.categories) ? Object.keys(value.categories).length : 0;
      const created = Array.isArray(value.new) ? value.new.length : 0;
      return `${cats} categorized · ${created} new`;
    }
    return "—";
  }
  return asString(value) ?? "—";
}

function buildApply(
  steps: CompletionStep[],
  suggestions: Record<string, unknown>,
  selected: Set<string>,
  repoPicks: Set<number>,
): ApplyPayload {
  const profile: Record<string, string> = {};
  const item_updates: NonNullable<ApplyPayload["item_updates"]> = [];
  const skills_updates: NonNullable<ApplyPayload["skills_updates"]> = [];
  const skills_new: NonNullable<ApplyPayload["skills_new"]> = [];
  const languages_new: NonNullable<ApplyPayload["languages_new"]> = [];
  const new_projects: NonNullable<ApplyPayload["new_projects"]> = [];

  for (const step of steps) {
    if (step.kind === "projects_from_github") {
      for (const repo of step.extra?.repos ?? []) {
        if (repoPicks.has(repo.github_repo_id)) {
          new_projects.push({
            name: repo.name,
            description: repo.purpose,
            technologies: repo.technologies,
            url: repo.url,
            github_repo_id: repo.github_repo_id,
          });
        }
      }
      continue;
    }
    if (!selected.has(step.id)) continue;
    const value = suggestions[step.id];
    if (value == null) continue;

    if (step.section === "identity" && step.field) {
      const s = asString(value);
      if (s) profile[step.field] = s;
      continue;
    }
    if (step.kind === "languages" && Array.isArray(value)) {
      const existing = step.extra?.existing ?? [];
      for (const raw of value) {
        if (!isRecord(raw)) continue;
        const name = asString(raw.name);
        if (!name) continue;
        const prof = asString(raw.proficiency);
        const match = existing.find((e) => e.name.toLowerCase() === name.toLowerCase());
        if (match && match.id != null && !match.proficiency && prof) {
          item_updates.push({ table: "languages", id: match.id, field: "proficiency", value: prof });
        } else if (!match) {
          languages_new.push({ name, proficiency: prof });
        }
      }
      continue;
    }
    if (step.kind === "skills" && isRecord(value)) {
      const categories = isRecord(value.categories) ? value.categories : {};
      const ratings = isRecord(value.ratings) ? value.ratings : {};
      for (const ex of step.extra?.existing ?? []) {
        if (ex.id == null) continue;
        const cat = asString(categories[ex.name]);
        const rating = asInt(ratings[ex.name]);
        if (cat || rating != null) skills_updates.push({ id: ex.id, category: cat, self_rating: rating });
      }
      if (Array.isArray(value.new)) {
        for (const raw of value.new) {
          if (!isRecord(raw)) continue;
          const name = asString(raw.name);
          if (!name) continue;
          skills_new.push({ name, category: asString(raw.category), self_rating: asInt(raw.self_rating) ?? 3 });
        }
      }
      continue;
    }
    // Per-item single-field update (short_text / enum / date / generative).
    if (step.table && step.entity_id != null && step.field) {
      const s = asString(value);
      if (s) item_updates.push({ table: step.table, id: step.entity_id, field: step.field, value: s });
    }
  }

  return { profile, item_updates, skills_updates, skills_new, languages_new, new_projects };
}

function AiCompleteModal({ onClose, onApplied }: { onClose: () => void; onApplied: () => void }) {
  const plan = useAsync(getCompletionPlan, []);
  const [phase, setPhase] = useState<"plan" | "review">("plan");
  const [suggestions, setSuggestions] = useState<Record<string, unknown>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [repoPicks, setRepoPicks] = useState<Set<number>>(new Set());
  const [streaming, setStreaming] = useState(false);
  const [applying, setApplying] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const steps = plan.data?.steps ?? [];
  const githubStep = steps.find((s) => s.kind === "projects_from_github");

  const start = () => {
    setPhase("review");
    setStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const onEvent = (e: SuggestionEvent) => {
      if (e.type === "suggestion") {
        setSuggestions((prev) => ({ ...prev, [e.id]: e.value }));
        setSelected((prev) => new Set(prev).add(e.id));
      } else if (e.type === "done") {
        setStreaming(false);
      } else {
        setStreaming(false);
        toast.danger("Suggestions failed", e.error);
      }
    };
    streamSuggestions(steps, onEvent, ctrl.signal).catch((err) => {
      if (!ctrl.signal.aborted) {
        setStreaming(false);
        toast.danger("Suggestions failed", errorMessage(err));
      }
    });
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleRepo = (id: number) =>
    setRepoPicks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedCount = [...selected].filter((id) => suggestions[id] != null).length + repoPicks.size;

  const apply = async () => {
    setApplying(true);
    try {
      const payload = buildApply(steps, suggestions, selected, repoPicks);
      const res = await applyCompletion(payload);
      const total = Object.values(res.saved ?? {}).reduce((a, b) => a + b, 0);
      toast.success("Profile updated", total ? `${total} change${total > 1 ? "s" : ""} applied.` : "Suggestions applied.");
      onApplied();
    } catch (err) {
      toast.danger("Couldn't apply", errorMessage(err));
      setApplying(false);
    }
  };

  return (
    <ModalShell onClose={onClose} width={560} title="AI complete empty fields">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-[10px] text-white" style={{ background: "var(--accent-grad)" }}>
          <SparkleIcon size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold text-fg">AI complete empty fields</div>
          <div className="text-[11.5px] text-fg-mid">Fill the gaps, grounded in your CV & GitHub — nothing is sent externally.</div>
        </div>
        {streaming ? (
          <Pill tone="accent" mono dot>
            Streaming
          </Pill>
        ) : null}
      </div>

      <div className="max-h-[54vh] overflow-y-auto p-5">
        <AsyncBoundary
          state={plan}
          skeleton={
            <div className="flex items-center justify-center gap-2 py-10 text-[12.5px] text-fg-mid">
              <Spinner size={18} /> Scanning your profile…
            </div>
          }
        >
          {(p) =>
            p.steps.length === 0 ? (
              <div className="rounded-[11px] border border-dashed border-border-strong bg-input px-4 py-8 text-center">
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-[12px] bg-accent-weak text-accent-text">
                  <SparkleIcon size={20} />
                </div>
                <div className="text-[13.5px] font-semibold text-fg">Your profile is complete.</div>
                <div className="mt-1 text-[12px] text-fg-mid">Every fillable section already has content — nothing left to fill.</div>
              </div>
            ) : phase === "plan" ? (
              <PlanList steps={p.steps} />
            ) : (
              <ReviewList
                steps={p.steps}
                suggestions={suggestions}
                selected={selected}
                onToggle={toggle}
                repoPicks={repoPicks}
                onToggleRepo={toggleRepo}
                githubStep={githubStep}
                streaming={streaming}
              />
            )
          }
        </AsyncBoundary>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-2 px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-[9px] border border-border-strong bg-transparent px-3.5 py-2 text-[12px] text-fg-mid transition-colors hover:border-accent hover:text-fg"
        >
          Cancel
        </button>
        {plan.data && plan.data.steps.length > 0 ? (
          phase === "plan" ? (
            <Button variant="primary" size="sm" onClick={start}>
              <SparkleIcon size={13} /> Generate suggestions
            </Button>
          ) : (
            <Button variant="primary" size="sm" loading={applying} disabled={streaming || selectedCount === 0} onClick={apply}>
              <SparkleIcon size={13} /> {selectedCount ? `Apply ${selectedCount}` : "Nothing selected"}
            </Button>
          )
        ) : null}
      </div>
    </ModalShell>
  );
}

function PlanList({ steps }: { steps: CompletionStep[] }) {
  const groups = new Map<string, CompletionStep[]>();
  for (const s of steps) {
    const list = groups.get(s.section_label) ?? [];
    list.push(s);
    groups.set(s.section_label, list);
  }
  return (
    <>
      <div className="mb-3 text-[10.5px] font-semibold tracking-[0.01em] text-fg-low">{steps.length} gaps found</div>
      <div className="flex flex-col gap-3">
        {[...groups.entries()].map(([label, list]) => (
          <div key={label} className="rounded-[11px] border border-border bg-surface-2 p-3.5">
            <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-fg">
              {label}
              <span className="rounded-full bg-accent-weak px-1.5 py-px font-mono text-[9px] text-accent-text">{list.length}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {list.map((s) => (
                <span key={s.id} className="rounded-[7px] border border-border bg-input px-2 py-1 text-[11px] text-fg-mid">
                  {s.label}
                  {s.context_label ? <span className="text-fg-low"> · {s.context_label}</span> : null}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function ReviewList({
  steps,
  suggestions,
  selected,
  onToggle,
  repoPicks,
  onToggleRepo,
  githubStep,
  streaming,
}: {
  steps: CompletionStep[];
  suggestions: Record<string, unknown>;
  selected: Set<string>;
  onToggle: (id: string) => void;
  repoPicks: Set<number>;
  onToggleRepo: (id: number) => void;
  githubStep: CompletionStep | undefined;
  streaming: boolean;
}) {
  const rows = steps.filter((s) => s.kind !== "projects_from_github" && suggestions[s.id] != null);
  const nothingYet = rows.length === 0 && !githubStep;
  return (
    <div className="flex flex-col gap-2">
      {rows.map((s) => {
        const on = selected.has(s.id);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onToggle(s.id)}
            className={cn(
              "flex items-start gap-3 rounded-[11px] border px-3.5 py-3 text-left transition-colors",
              on ? "border-accent bg-accent-weak" : "border-border bg-surface-2",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border",
                on ? "border-transparent text-white" : "border-border-strong text-transparent",
              )}
              style={on ? { background: "var(--accent-grad)" } : undefined}
            >
              <CheckIcon size={12} strokeWidth={2.6} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[12.5px] font-semibold text-fg">{s.label}</span>
                {s.context_label ? <span className="truncate font-mono text-[10px] text-fg-low">{s.context_label}</span> : null}
                <span className="ml-auto shrink-0 font-mono text-[9px] text-fg-low">{s.section_label}</span>
              </div>
              <div className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-fg-mid">{previewValue(s, suggestions[s.id])}</div>
            </div>
          </button>
        );
      })}

      {streaming ? (
        <div className="flex items-center gap-2 py-2 text-[11.5px] text-fg-low">
          <Spinner size={14} /> Drafting the rest…
        </div>
      ) : null}

      {githubStep && (githubStep.extra?.repos?.length ?? 0) > 0 ? (
        <div className="mt-1 rounded-[11px] border border-border bg-surface-2 p-3.5">
          <div className="mb-2 flex items-center gap-2 text-[12.5px] font-semibold text-fg">
            <BranchIcon size={14} strokeWidth={1.5} /> Turn GitHub repos into projects
          </div>
          <div className="flex flex-col gap-1.5">
            {(githubStep.extra?.repos ?? []).map((repo) => {
              const on = repoPicks.has(repo.github_repo_id);
              return (
                <button
                  key={repo.github_repo_id}
                  type="button"
                  onClick={() => onToggleRepo(repo.github_repo_id)}
                  className={cn(
                    "flex items-center gap-3 rounded-[9px] border px-3 py-2 text-left transition-colors",
                    on ? "border-accent bg-accent-weak" : "border-border bg-input",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border",
                      on ? "border-transparent text-white" : "border-border-strong text-transparent",
                    )}
                    style={on ? { background: "var(--accent-grad)" } : undefined}
                  >
                    <CheckIcon size={10} strokeWidth={2.6} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-semibold text-fg">{repo.name}</div>
                    {repo.purpose ? <div className="truncate text-[11px] text-fg-mid">{repo.purpose}</div> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {nothingYet && !streaming ? (
        <div className="py-8 text-center text-[12.5px] text-fg-mid">No groundable suggestions were produced.</div>
      ) : null}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Inline icons (20×20, stroke = currentColor)
   ══════════════════════════════════════════════════════════════════ */
type IconProps = { size?: number; strokeWidth?: number; className?: string };
function Svg({ size = 20, strokeWidth = 1.5, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0 inline-block align-middle", className)}
      aria-hidden
    >
      {children}
    </svg>
  );
}
function SparkleIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10 3l1.5 4L16 8l-4.5 1L10 13l-1.5-4L4 8l4.5-1z" />
    </Svg>
  );
}
function PencilIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 16l1-4 8.5-8.5 3 3L8 15l-4 1z" />
    </Svg>
  );
}
function PlusIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10 4v12M4 10h12" />
    </Svg>
  );
}
function CapIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10 4l8 3.5-8 3.5-8-3.5z" />
      <path d="M5 9v4c0 1 2.5 2.5 5 2.5s5-1.5 5-2.5V9" />
    </Svg>
  );
}
function AwardIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="10" cy="8" r="4" />
      <path d="M7.5 11.5L6 17l4-2 4 2-1.5-5.5" />
    </Svg>
  );
}
function BookIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10 5C8.5 3.8 6.5 3.5 4 3.8v10.5c2.5-.3 4.5 0 6 1.2 1.5-1.2 3.5-1.5 6-1.2V3.8c-2.5-.3-4.5 0-6 1.2z" />
      <path d="M10 5v10.5" />
    </Svg>
  );
}
function LinkIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 11a3 3 0 0 0 4 0l2-2a3 3 0 0 0-4-4l-1 1" />
      <path d="M12 9a3 3 0 0 0-4 0l-2 2a3 3 0 0 0 4 4l1-1" />
    </Svg>
  );
}
function BranchIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="6" cy="5" r="2" />
      <circle cx="6" cy="15" r="2" />
      <circle cx="14" cy="8" r="2" />
      <path d="M6 7v6M6 11h5a3 3 0 0 0 3-3" />
    </Svg>
  );
}
function BriefcaseIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="6" width="14" height="10" rx="1.5" />
      <path d="M7 6V4.5A1.5 1.5 0 0 1 8.5 3h3A1.5 1.5 0 0 1 13 4.5V6" />
    </Svg>
  );
}
function StarIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10 3l2.1 4.3 4.7.7-3.4 3.3.8 4.7L10 13.9 5.8 16l.8-4.7L3.2 8l4.7-.7z" />
    </Svg>
  );
}
function GlobeIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="10" cy="10" r="7" />
      <path d="M3 10h14M10 3c2.2 2.4 2.2 11.6 0 14M10 3c-2.2 2.4-2.2 11.6 0 14" />
    </Svg>
  );
}
function CheckIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 10l4 4 8-9" />
    </Svg>
  );
}
