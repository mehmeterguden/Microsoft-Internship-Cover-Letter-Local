import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Award,
  BookOpen,
  Briefcase,
  FolderGit2,
  GraduationCap,
  Languages as LangIcon,
  Link2,
  Sparkles,
  User,
  Wrench,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { AsyncBoundary } from "@/components/common/AsyncBoundary";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RatingInput } from "@/components/common/RatingInput";
import { SkillTag } from "@/components/common/SkillTag";
import { ProvenanceBadge } from "@/components/common/ProvenanceBadge";
import { CrudSection, type SectionConfig } from "@/components/profile/CrudSection";
import type {
  Certificate,
  Education,
  Experience,
  FieldSource,
  Language,
  Link as LinkType,
  Profile as ProfileType,
  Project,
  Skill,
  Training,
} from "@/api/types";
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
import { getCompletionPlan } from "@/api/profileCompletion";
import { errorMessage } from "@/api/client";
import { useAsync } from "@/lib/useAsync";
import { useSection } from "@/lib/useSection";
import { toast } from "@/store/toast";

// ── Enum option lists (mirror the backend enums) ─────────────────

const EMPLOYMENT = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "internship", label: "Internship" },
  { value: "freelance", label: "Freelance" },
  { value: "volunteer", label: "Volunteer" },
  { value: "other", label: "Other" },
];

const CERT_TYPES = [
  { value: "professional", label: "Professional" },
  { value: "course", label: "Course" },
  { value: "exam", label: "Exam" },
  { value: "language", label: "Language" },
  { value: "award", label: "Award" },
  { value: "bootcamp", label: "Bootcamp" },
  { value: "other", label: "Other" },
];

const PROFICIENCY = [
  { value: "native", label: "Native" },
  { value: "fluent", label: "Fluent" },
  { value: "professional", label: "Professional" },
  { value: "intermediate", label: "Intermediate" },
  { value: "basic", label: "Basic" },
];


// Join defined parts of a subtitle line with a middot separator.
const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ");

// ── Identity field with inline provenance badge ──────────────────

function IdentityField({
  id,
  label,
  value,
  onChange,
  type = "text",
  source,
  textarea = false,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  source?: FieldSource;
  textarea?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center gap-2">
        <Label htmlFor={id}>{label}</Label>
        {source && <ProvenanceBadge source={source.source} detail={source.detail} at={source.at} />}
      </div>
      {textarea ? (
        <Textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

export function Profile() {
  const loaded = useAsync(
    async () => {
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
    },
    [],
  );

  const navigate = useNavigate();
  const gaps = useAsync(getCompletionPlan, []);
  const gapCount = gaps.data?.total ?? 0;

  const [profile, setProfileState] = useState<ProfileType>({});
  const [saving, setSaving] = useState(false);

  const empty = { skills: [], experiences: [], education: [], languages: [], projects: [], certificates: [], trainings: [], links: [] };
  const skills = useSection<Skill>(loaded.data?.skills ?? empty.skills, skillsApi, "skill");
  const experiences = useSection<Experience>(loaded.data?.experiences ?? empty.experiences, experiencesApi, "experience");
  const education = useSection<Education>(loaded.data?.education ?? empty.education, educationApi, "education entry");
  const languages = useSection<Language>(loaded.data?.languages ?? empty.languages, languagesApi, "language");
  const projects = useSection<Project>(loaded.data?.projects ?? empty.projects, projectsApi, "project");
  const certificates = useSection<Certificate>(loaded.data?.certificates ?? empty.certificates, certificatesApi, "certificate");
  const trainings = useSection<Training>(loaded.data?.trainings ?? empty.trainings, trainingsApi, "training");
  const links = useSection<LinkType>(loaded.data?.links ?? empty.links, linksApi, "link");

  useEffect(() => {
    if (loaded.data) setProfileState(loaded.data.profile);
  }, [loaded.data]);

  function field<K extends keyof ProfileType>(key: K, value: ProfileType[K]) {
    setProfileState((prev) => ({ ...prev, [key]: value }));
  }

  const srcOf = (key: string) => profile.field_sources?.[key];

  async function saveIdentity() {
    setSaving(true);
    try {
      await saveProfile(profile);
      toast.success("Profile saved");
    } catch (err) {
      toast.danger("Save failed", errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  // ── Section configs ────────────────────────────────────────────

  const skillsConfig: SectionConfig<Skill> = {
    singular: "skill",
    icon: Wrench,
    emptyTitle: "No skills yet",
    emptyDescription: "Add your first skill, or import your CV to fill them in.",
    make: () => ({ name: "", self_rating: 3, cv_mentioned: false, source: "manual" }),
    fields: [
      { key: "name", label: "Skill", required: true, placeholder: "e.g. TypeScript" },
      { key: "category", label: "Category", placeholder: "e.g. Frontend" },
      { key: "years_experience", label: "Years of experience", type: "number", placeholder: "e.g. 3" },
      { key: "cv_mentioned", label: "Mentioned on CV", type: "switch" },
      { key: "note", label: "Note", type: "textarea", colSpan: 2, placeholder: "Where you learned it / context to mention." },
    ],
    primary: (s) => s.name,
    meta: (s) => (
      <span className="flex items-center gap-2">
        {s.category && <Badge tone="neutral">{s.category}</Badge>}
        {s.cv_mentioned && <Badge tone="accent">On CV</Badge>}
        {s.years_experience != null && <Badge tone="blue">{s.years_experience}y</Badge>}
        <RatingInput value={s.self_rating ?? 0} onChange={(v) => skills.patch(s, { self_rating: v })} />
      </span>
    ),
    body: (s) => (s.note ? <p className="text-text-2">{s.note}</p> : null),
  };

  const experiencesConfig: SectionConfig<Experience> = {
    singular: "experience",
    icon: Briefcase,
    emptyTitle: "No experience yet",
    emptyDescription: "Add a role, or import your CV to fill this in.",
    make: () => ({ company: "", title: "", is_current: false, source: "manual" }),
    fields: [
      { key: "title", label: "Title", required: true, placeholder: "e.g. Software Engineer Intern" },
      { key: "company", label: "Company", required: true },
      { key: "employment_type", label: "Employment type", type: "select", options: EMPLOYMENT },
      { key: "location", label: "Location" },
      { key: "start_date", label: "Start", type: "month" },
      { key: "end_date", label: "End", type: "month", hint: "Leave blank if current" },
      { key: "is_current", label: "I currently work here", type: "switch" },
      { key: "description", label: "Description", type: "textarea", colSpan: 2 },
    ],
    primary: (e) => e.title,
    secondary: (e) => join(e.company, e.location, `${e.start_date ?? "?"} – ${e.is_current ? "present" : e.end_date ?? "?"}`),
    meta: (e) => (
      <span className="flex items-center gap-2">
        {e.employment_type && <Badge tone="neutral">{EMPLOYMENT.find((x) => x.value === e.employment_type)?.label}</Badge>}
        {e.is_current && <Badge tone="success">Current</Badge>}
      </span>
    ),
    body: (e) => (e.description ? <p>{e.description}</p> : null),
  };

  const educationConfig: SectionConfig<Education> = {
    singular: "education entry",
    icon: GraduationCap,
    emptyTitle: "No education yet",
    emptyDescription: "Add a degree, or import your CV to fill this in.",
    make: () => ({ institution: "", is_current: false, source: "manual" }),
    fields: [
      { key: "institution", label: "Institution", required: true },
      { key: "degree", label: "Degree", placeholder: "e.g. BSc" },
      { key: "field", label: "Field of study" },
      { key: "location", label: "Location" },
      { key: "start_date", label: "Start", type: "month" },
      { key: "end_date", label: "End", type: "month" },
      { key: "is_current", label: "Currently studying", type: "switch" },
      { key: "gpa", label: "GPA" },
    ],
    primary: (e) => e.institution,
    secondary: (e) => join([e.degree, e.field].filter(Boolean).join(" in "), `${e.start_date ?? "?"} – ${e.is_current ? "present" : e.end_date ?? "?"}`, e.gpa ? `GPA ${e.gpa}` : null),
  };

  const languagesConfig: SectionConfig<Language> = {
    singular: "language",
    icon: LangIcon,
    emptyTitle: "No languages yet",
    emptyDescription: "Add the languages you speak.",
    make: () => ({ name: "", source: "manual" }),
    fields: [
      { key: "name", label: "Language", required: true, placeholder: "e.g. English" },
      { key: "proficiency", label: "Proficiency", type: "select", options: PROFICIENCY },
    ],
    primary: (l) => l.name,
    meta: (l) => (l.proficiency ? <Badge tone="blue">{PROFICIENCY.find((x) => x.value === l.proficiency)?.label}</Badge> : null),
  };

  const projectsConfig: SectionConfig<Project> = {
    singular: "project",
    icon: FolderGit2,
    emptyTitle: "No projects yet",
    emptyDescription: "Add a project you've built.",
    make: () => ({ name: "", technologies: [], source: "manual" }),
    fields: [
      { key: "name", label: "Project", required: true },
      { key: "role", label: "Your role" },
      { key: "url", label: "URL", placeholder: "https://" },
      { key: "technologies", label: "Technologies", type: "tags", placeholder: "React, Node, Postgres" },
      { key: "start_date", label: "Start", type: "month" },
      { key: "end_date", label: "End", type: "month" },
      { key: "description", label: "Description", type: "textarea", colSpan: 2 },
    ],
    primary: (p) => p.name,
    secondary: (p) => join(p.role, `${p.start_date ?? ""}${p.end_date ? ` – ${p.end_date}` : ""}` || null),
    body: (p) => (
      <div className="grid gap-2">
        {p.description && <p>{p.description}</p>}
        {p.technologies && p.technologies.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {p.technologies.map((t) => <SkillTag key={t}>{t}</SkillTag>)}
          </div>
        )}
      </div>
    ),
  };

  const certificatesConfig: SectionConfig<Certificate> = {
    singular: "certificate",
    icon: Award,
    emptyTitle: "No certificates yet",
    emptyDescription: "Add a certificate or credential you've earned.",
    make: () => ({ name: "", source: "manual" }),
    fields: [
      { key: "name", label: "Certificate", required: true },
      { key: "issuer", label: "Issuer" },
      { key: "cert_type", label: "Type", type: "select", options: CERT_TYPES },
      { key: "issue_date", label: "Issued", type: "month" },
      { key: "expiry_date", label: "Expires", type: "month", maxMonthsAhead: null, hint: "Leave blank if none" },
      { key: "credential_id", label: "Credential ID" },
      { key: "url", label: "URL", placeholder: "https://", colSpan: 2 },
    ],
    primary: (c) => c.name,
    secondary: (c) => join(c.issuer, c.issue_date),
    meta: (c) => (c.cert_type ? <Badge tone="violet">{CERT_TYPES.find((x) => x.value === c.cert_type)?.label}</Badge> : null),
  };

  const trainingsConfig: SectionConfig<Training> = {
    singular: "training",
    icon: BookOpen,
    emptyTitle: "No trainings yet",
    emptyDescription: "Add a course or training you've completed.",
    make: () => ({ name: "", source: "manual" }),
    fields: [
      { key: "name", label: "Training", required: true },
      { key: "provider", label: "Provider" },
      { key: "completion_date", label: "Completed", type: "month" },
      { key: "url", label: "URL", placeholder: "https://" },
      { key: "description", label: "Description", type: "textarea", colSpan: 2 },
    ],
    primary: (t) => t.name,
    secondary: (t) => join(t.provider, t.completion_date),
    body: (t) => (t.description ? <p>{t.description}</p> : null),
  };

  const linksConfig: SectionConfig<LinkType> = {
    singular: "link",
    icon: Link2,
    emptyTitle: "No links yet",
    emptyDescription: "Add a portfolio, blog, or other profile link.",
    make: () => ({ label: "", url: "", source: "manual" }),
    fields: [
      { key: "label", label: "Label", required: true, placeholder: "e.g. Portfolio" },
      { key: "url", label: "URL", required: true, placeholder: "https://" },
      { key: "description", label: "Note", type: "textarea", colSpan: 2 },
    ],
    primary: (l) => l.label,
    secondary: (l) => l.url,
    body: (l) => (l.description ? <p>{l.description}</p> : null),
  };

  const counts = [
    { label: "skills", n: skills.items.length, tone: "bg-accent-soft text-accent-ink" },
    { label: "roles", n: experiences.items.length, tone: "bg-blue-soft text-blue" },
    { label: "projects", n: projects.items.length, tone: "bg-violet-soft text-violet" },
  ];

  // Nine sections, grouped into three for the left-rail nav. Counts are live so
  // the badges track edits without a reload. Identity has no list, so no count.
  const NAV_GROUPS = [
    {
      title: "Identity & contact",
      items: [
        { value: "identity", label: "Identity", icon: User },
        { value: "languages", label: "Languages", icon: LangIcon, count: languages.items.length },
        { value: "links", label: "Links", icon: Link2, count: links.items.length },
      ],
    },
    {
      title: "Experience & education",
      items: [
        { value: "experience", label: "Experience", icon: Briefcase, count: experiences.items.length },
        { value: "projects", label: "Projects", icon: FolderGit2, count: projects.items.length },
        { value: "education", label: "Education", icon: GraduationCap, count: education.items.length },
      ],
    },
    {
      title: "Skills & credentials",
      items: [
        { value: "skills", label: "Skills", icon: Wrench, count: skills.items.length },
        { value: "certificates", label: "Certificates", icon: Award, count: certificates.items.length },
        { value: "trainings", label: "Trainings", icon: BookOpen, count: trainings.items.length },
      ],
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Build your profile"
        title="Profile & Skills"
        icon={User}
        description="Everything the generator draws from. Each item shows where it came from — keep it sharp."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate("/profile/complete")}>
              <Sparkles size={16} /> Complete with AI
              {gapCount > 0 && (
                <span className="ml-0.5 rounded-full bg-accent-soft px-1.5 py-0.5 text-[11px] font-bold text-accent-ink">
                  {gapCount}
                </span>
              )}
            </Button>
            <Button onClick={saveIdentity} loading={saving}>
              Save identity
            </Button>
          </>
        }
      />

      {!loaded.loading && !loaded.error && (
        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-[18px] border border-border bg-surface p-5 shadow-soft">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-accent-soft text-[18px] font-extrabold text-accent-ink">
            {(profile.name?.[0] ?? "") + (profile.surname?.[0] ?? "") || "?"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-bold text-text">
              {[profile.name, profile.surname].filter(Boolean).join(" ") || "Your name"}
            </p>
            <p className="truncate text-[13.5px] text-text-2">{profile.email || "Add your contact details"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {counts.map((c) => (
              <span key={c.label} className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold ${c.tone}`}>
                {c.n} {c.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <AsyncBoundary loading={loaded.loading} error={loaded.error} onRetry={loaded.reload}>
        {/* Grouped left-rail navigation: nine sections collapse into three
            labelled groups, each item showing a live count. Calmer than a row of
            nine tabs and it scales cleanly. */}
        <Tabs defaultValue="identity" orientation="vertical" className="flex flex-col gap-5 lg:flex-row lg:gap-6">
          <TabsPrimitive.List
            aria-label="Profile sections"
            className="flex shrink-0 flex-col gap-5 self-start rounded-[16px] border border-border bg-surface p-3 shadow-soft lg:sticky lg:top-4 lg:w-60"
          >
            {NAV_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="px-2 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.09em] text-text-3">
                  {group.title}
                </p>
                <div className="flex flex-col gap-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <TabsPrimitive.Trigger
                        key={item.value}
                        value={item.value}
                        className="group flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left text-[13.5px] font-medium text-text-2 transition-colors hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-[state=active]:bg-accent-soft data-[state=active]:font-semibold data-[state=active]:text-accent-ink"
                      >
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-surface-2 text-text-2 transition-colors group-hover:bg-surface group-data-[state=active]:bg-accent group-data-[state=active]:text-on-accent">
                          <Icon size={14} />
                        </span>
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.count !== undefined && (
                          <span className="ml-auto rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-text-3 group-data-[state=active]:bg-accent/15 group-data-[state=active]:text-accent-ink">
                            {item.count}
                          </span>
                        )}
                      </TabsPrimitive.Trigger>
                    );
                  })}
                </div>
              </div>
            ))}
          </TabsPrimitive.List>

          <div className="min-w-0 flex-1">
            <TabsContent value="identity" className="mt-0">
              <Card>
                <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
                  <IdentityField id="fn" label="First name" value={profile.name ?? ""} onChange={(v) => field("name", v)} source={srcOf("name")} />
                  <IdentityField id="ln" label="Last name" value={profile.surname ?? ""} onChange={(v) => field("surname", v)} source={srcOf("surname")} />
                  <IdentityField id="em" label="Email" type="email" value={profile.email ?? ""} onChange={(v) => field("email", v)} source={srcOf("email")} />
                  <IdentityField id="ph" label="Phone" value={profile.phone ?? ""} onChange={(v) => field("phone", v)} source={srcOf("phone")} />
                  <IdentityField id="li" label="LinkedIn" value={profile.linkedin ?? ""} onChange={(v) => field("linkedin", v)} source={srcOf("linkedin")} />
                  <IdentityField id="gh" label="GitHub" value={profile.github ?? ""} onChange={(v) => field("github", v)} source={srcOf("github")} />
                  <IdentityField id="sm" label="Summary" textarea className="sm:col-span-2" value={profile.summary ?? ""} onChange={(v) => field("summary", v)} source={srcOf("summary")} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="skills" className="mt-0"><CrudSection config={skillsConfig} section={skills} /></TabsContent>
            <TabsContent value="experience" className="mt-0"><CrudSection config={experiencesConfig} section={experiences} /></TabsContent>
            <TabsContent value="education" className="mt-0"><CrudSection config={educationConfig} section={education} /></TabsContent>
            <TabsContent value="projects" className="mt-0"><CrudSection config={projectsConfig} section={projects} /></TabsContent>
            <TabsContent value="certificates" className="mt-0"><CrudSection config={certificatesConfig} section={certificates} /></TabsContent>
            <TabsContent value="trainings" className="mt-0"><CrudSection config={trainingsConfig} section={trainings} /></TabsContent>
            <TabsContent value="languages" className="mt-0"><CrudSection config={languagesConfig} section={languages} /></TabsContent>
            <TabsContent value="links" className="mt-0"><CrudSection config={linksConfig} section={links} /></TabsContent>
          </div>
        </Tabs>
      </AsyncBoundary>
    </>
  );
}
