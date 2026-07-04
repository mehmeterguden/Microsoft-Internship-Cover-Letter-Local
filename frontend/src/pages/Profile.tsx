import { useEffect, useState } from "react";
import { Briefcase, GraduationCap, Languages as LangIcon, Plus, Trash2, User } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { AsyncBoundary } from "@/components/common/AsyncBoundary";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/EmptyState";
import { RatingInput } from "@/components/common/RatingInput";
import { SkillTag } from "@/components/common/SkillTag";
import type { Education, Experience, Language, Profile as ProfileType, Skill } from "@/api/types";
import {
  createSkill,
  deleteSkill,
  getProfile,
  listEducation,
  listExperiences,
  listLanguages,
  listSkills,
  saveProfile,
  updateSkill,
} from "@/api/profile";
import { errorMessage } from "@/api/client";
import { useAsync } from "@/lib/useAsync";
import { toast } from "@/store/toast";

export function Profile() {
  const loaded = useAsync(
    async () => {
      const [profile, skills, experiences, education, languages] = await Promise.all([
        getProfile(),
        listSkills(),
        listExperiences(),
        listEducation(),
        listLanguages(),
      ]);
      return { profile, skills, experiences, education, languages };
    },
    [],
  );

  const [profile, setProfileState] = useState<ProfileType>({});
  const [skills, setSkills] = useState<Skill[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [education, setEducation] = useState<Education[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [newSkill, setNewSkill] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loaded.data) return;
    setProfileState(loaded.data.profile);
    setSkills(loaded.data.skills);
    setExperiences(loaded.data.experiences);
    setEducation(loaded.data.education);
    setLanguages(loaded.data.languages);
  }, [loaded.data]);

  function field<K extends keyof ProfileType>(key: K, value: ProfileType[K]) {
    setProfileState((prev) => ({ ...prev, [key]: value }));
  }

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

  async function addSkill() {
    const name = newSkill.trim();
    if (!name) return;
    try {
      const created = await createSkill({ name, self_rating: 3, cv_mentioned: false });
      setSkills((prev) => [...prev, created]);
      setNewSkill("");
    } catch (err) {
      toast.danger("Couldn't add skill", errorMessage(err));
    }
  }

  async function removeSkill(id: number) {
    try {
      await deleteSkill(id);
      setSkills((prev) => prev.filter((x) => x.id !== id));
    } catch (err) {
      toast.danger("Couldn't remove skill", errorMessage(err));
    }
  }

  async function rateSkill(skill: Skill, rating: number) {
    setSkills((prev) => prev.map((x) => (x.id === skill.id ? { ...x, self_rating: rating } : x)));
    try {
      if (skill.id != null) await updateSkill(skill.id, { ...skill, self_rating: rating });
    } catch (err) {
      toast.danger("Couldn't update rating", errorMessage(err));
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Build your profile"
        title="Profile & Skills"
        icon={User}
        description="Everything the generator draws from. Keep it sharp — the letters are only as good as this."
        actions={<Button onClick={saveIdentity} loading={saving}>Save changes</Button>}
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
          <div className="flex gap-2">
            <span className="rounded-full bg-accent-soft px-3 py-1.5 text-[12.5px] font-semibold text-accent-ink">
              {skills.length} skills
            </span>
            <span className="rounded-full bg-blue-soft px-3 py-1.5 text-[12.5px] font-semibold text-blue">
              {experiences.length} roles
            </span>
          </div>
        </div>
      )}

      <AsyncBoundary loading={loaded.loading} error={loaded.error} onRetry={loaded.reload}>
        <Tabs defaultValue="identity">
          <TabsList>
            <TabsTrigger value="identity"><User size={14} /> Identity</TabsTrigger>
            <TabsTrigger value="skills">Skills</TabsTrigger>
            <TabsTrigger value="experience"><Briefcase size={14} /> Experience</TabsTrigger>
            <TabsTrigger value="education"><GraduationCap size={14} /> Education</TabsTrigger>
            <TabsTrigger value="languages"><LangIcon size={14} /> Languages</TabsTrigger>
          </TabsList>

          <TabsContent value="identity">
            <Card>
              <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
                <Field label="First name" htmlFor="fn"><Input id="fn" value={profile.name ?? ""} onChange={(e) => field("name", e.target.value)} /></Field>
                <Field label="Last name" htmlFor="ln"><Input id="ln" value={profile.surname ?? ""} onChange={(e) => field("surname", e.target.value)} /></Field>
                <Field label="Email" htmlFor="em"><Input id="em" type="email" value={profile.email ?? ""} onChange={(e) => field("email", e.target.value)} /></Field>
                <Field label="Phone" htmlFor="ph"><Input id="ph" value={profile.phone ?? ""} onChange={(e) => field("phone", e.target.value)} /></Field>
                <Field label="LinkedIn" htmlFor="li"><Input id="li" value={profile.linkedin ?? ""} onChange={(e) => field("linkedin", e.target.value)} /></Field>
                <Field label="GitHub" htmlFor="gh"><Input id="gh" value={profile.github ?? ""} onChange={(e) => field("github", e.target.value)} /></Field>
                <Field label="Summary" htmlFor="sm" className="sm:col-span-2">
                  <Textarea id="sm" value={profile.summary ?? ""} onChange={(e) => field("summary", e.target.value)} />
                </Field>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="skills">
            <Card>
              <CardHeader><CardTitle>Skills</CardTitle></CardHeader>
              <CardContent className="grid gap-3">
                {skills.length === 0 && (
                  <p className="text-[13.5px] text-text-3">No skills yet — add your first below.</p>
                )}
                {skills.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-border bg-surface-2 px-4 py-3"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-[14px] font-semibold text-text">{s.name}</span>
                      {s.category && <Badge tone="neutral">{s.category}</Badge>}
                      {s.cv_mentioned && <Badge tone="accent">On CV</Badge>}
                    </div>
                    <div className="flex items-center gap-3">
                      <RatingInput value={s.self_rating ?? 0} onChange={(v) => rateSkill(s, v)} />
                      <button
                        type="button"
                        aria-label={`Remove ${s.name}`}
                        onClick={() => s.id != null && removeSkill(s.id)}
                        className="rounded-[7px] p-1.5 text-text-3 transition-colors hover:bg-danger-soft hover:text-danger"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input
                    value={newSkill}
                    onChange={(e) => setNewSkill(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addSkill()}
                    placeholder="Add a skill…"
                  />
                  <Button variant="dashed" onClick={addSkill}><Plus size={15} /> Add</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="experience">
            <div className="grid gap-4">
              {experiences.length === 0 ? (
                <EmptyState icon={Briefcase} title="No experience yet" description="Import your CV to fill this in." />
              ) : (
                experiences.map((e) => (
                  <Card key={e.id}>
                    <CardContent className="pt-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-[15.5px] font-bold">{e.title}</h3>
                        {e.is_current && <Badge tone="success">Current</Badge>}
                      </div>
                      <p className="text-[13.5px] text-text-2">
                        {e.company} · {e.location} · {e.start_date} – {e.end_date ?? "present"}
                      </p>
                      <p className="mt-2 text-[14px] text-text-2">{e.description}</p>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="education">
            <div className="grid gap-4">
              {education.length === 0 ? (
                <EmptyState icon={GraduationCap} title="No education yet" description="Import your CV to fill this in." />
              ) : (
                education.map((e) => (
                  <Card key={e.id}>
                    <CardContent className="pt-5">
                      <h3 className="text-[15.5px] font-bold">{e.institution}</h3>
                      <p className="text-[13.5px] text-text-2">
                        {e.degree} in {e.field} · {e.start_date} – {e.end_date} · GPA {e.gpa}
                      </p>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="languages">
            <Card>
              <CardContent className="flex flex-wrap gap-2 pt-5">
                {languages.length === 0 ? (
                  <p className="text-[13.5px] text-text-3">No languages yet.</p>
                ) : (
                  languages.map((l) => (
                    <SkillTag key={l.id}>{l.name} · {l.proficiency}</SkillTag>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </AsyncBoundary>
    </>
  );
}
