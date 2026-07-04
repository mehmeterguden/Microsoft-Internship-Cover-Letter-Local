import { useState } from "react";
import { Briefcase, GraduationCap, Languages as LangIcon, Plus, Trash2, User } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RatingInput } from "@/components/common/RatingInput";
import { SkillTag } from "@/components/common/SkillTag";
import {
  mockEducation,
  mockExperiences,
  mockLanguages,
  mockProfile,
  mockSkills,
} from "@/mocks/data";
import type { Skill } from "@/api/types";
import { toast } from "@/store/toast";

export function Profile() {
  const [skills, setSkills] = useState<Skill[]>(mockSkills);
  const [newSkill, setNewSkill] = useState("");

  function addSkill() {
    const name = newSkill.trim();
    if (!name) return;
    setSkills((prev) => [...prev, { id: Date.now(), name, self_rating: 3, cv_mentioned: false }]);
    setNewSkill("");
  }

  return (
    <>
      <PageHeader
        eyebrow="Build your profile"
        title="Profile & Skills"
        description="Everything the generator draws from. Keep it sharp — the letters are only as good as this."
        actions={<Button onClick={() => toast.success("Profile saved")}>Save changes</Button>}
      />

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
              <Field label="First name" htmlFor="fn"><Input id="fn" defaultValue={mockProfile.name ?? ""} /></Field>
              <Field label="Last name" htmlFor="ln"><Input id="ln" defaultValue={mockProfile.surname ?? ""} /></Field>
              <Field label="Email" htmlFor="em"><Input id="em" type="email" defaultValue={mockProfile.email ?? ""} /></Field>
              <Field label="Phone" htmlFor="ph"><Input id="ph" defaultValue={mockProfile.phone ?? ""} /></Field>
              <Field label="LinkedIn" htmlFor="li"><Input id="li" defaultValue={mockProfile.linkedin ?? ""} /></Field>
              <Field label="GitHub" htmlFor="gh"><Input id="gh" defaultValue={mockProfile.github ?? ""} /></Field>
              <Field label="Summary" htmlFor="sm" className="sm:col-span-2">
                <Textarea id="sm" defaultValue={mockProfile.summary ?? ""} />
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="skills">
          <Card>
            <CardHeader>
              <CardTitle>Skills</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
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
                    <RatingInput value={s.self_rating ?? 0} onChange={(v) =>
                      setSkills((prev) => prev.map((x) => (x.id === s.id ? { ...x, self_rating: v } : x)))
                    } />
                    <button
                      type="button"
                      aria-label={`Remove ${s.name}`}
                      onClick={() => setSkills((prev) => prev.filter((x) => x.id !== s.id))}
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
                <Button variant="dashed" onClick={addSkill}>
                  <Plus size={15} /> Add
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="experience">
          <div className="grid gap-4">
            {mockExperiences.map((e) => (
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
            ))}
            <Button variant="dashed" className="w-full py-6" onClick={() => toast.info("Coming soon", "Add experience form")}>
              <Plus size={16} /> Add experience
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="education">
          <div className="grid gap-4">
            {mockEducation.map((e) => (
              <Card key={e.id}>
                <CardContent className="pt-5">
                  <h3 className="text-[15.5px] font-bold">{e.institution}</h3>
                  <p className="text-[13.5px] text-text-2">
                    {e.degree} in {e.field} · {e.start_date} – {e.end_date} · GPA {e.gpa}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="languages">
          <Card>
            <CardContent className="flex flex-wrap gap-2 pt-5">
              {mockLanguages.map((l) => (
                <SkillTag key={l.id}>
                  {l.name} · {l.proficiency}
                </SkillTag>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
