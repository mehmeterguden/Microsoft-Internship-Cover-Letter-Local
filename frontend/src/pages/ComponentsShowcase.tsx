import { useState } from "react";
import { FileText, Github, Rocket, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ScoreRing } from "@/components/common/ScoreRing";
import { Stepper } from "@/components/common/Stepper";
import { SkillTag } from "@/components/common/SkillTag";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Avatar } from "@/components/common/Avatar";
import { EmptyState } from "@/components/common/EmptyState";
import { RatingInput } from "@/components/common/RatingInput";
import { SourceChip } from "@/components/common/SourceChip";
import { StreamingText } from "@/components/common/StreamingText";
import { FileDropzone } from "@/components/common/FileDropzone";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { toast } from "@/store/toast";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-text-3">
        {title}
      </p>
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </section>
  );
}

/** Every component, rendered once. Placed inside a forced-theme panel below. */
function Gallery() {
  const [rating, setRating] = useState(3);
  const [checked, setChecked] = useState(true);
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="text-text">
      <Section title="Buttons">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="dashed">+ Add item</Button>
        <Button variant="danger">Delete</Button>
        <Button loading>Working</Button>
        <Button size="sm">Small</Button>
        <Button size="lg">
          <Rocket size={16} /> Launch
        </Button>
      </Section>

      <Section title="Badges & status">
        <Badge tone="accent">Accent</Badge>
        <Badge tone="gold">Gold</Badge>
        <Badge tone="blue">Blue</Badge>
        <Badge tone="violet">Violet</Badge>
        <Badge tone="danger">Danger</Badge>
        <Badge tone="success">Success</Badge>
        <Badge tone="neutral">Neutral</Badge>
        <StatusBadge status="draft" />
        <StatusBadge status="sent" />
        <StatusBadge status="interview" />
        <StatusBadge status="offer" />
        <StatusBadge status="rejected" />
      </Section>

      <Section title="Skill tags & sources">
        <SkillTag>TypeScript</SkillTag>
        <SkillTag onRemove={() => {}}>React</SkillTag>
        <SkillTag onRemove={() => {}}>FastAPI</SkillTag>
        <SourceChip label="wikipedia.org" url="https://wikipedia.org" ok />
        <SourceChip label="failed source" ok={false} />
      </Section>

      <Section title="Inputs">
        <div className="grid w-full max-w-md gap-4">
          <Field label="Company" htmlFor="d-company" required hint="Where you're applying">
            <Input id="d-company" placeholder="Acme Inc." />
          </Field>
          <Field label="Job description" htmlFor="d-jd">
            <Textarea id="d-jd" placeholder="Paste the posting…" />
          </Field>
          <Field label="Tone" htmlFor="d-tone">
            <Select id="d-tone" defaultValue="professional">
              <option value="professional">Professional</option>
              <option value="warm">Warm</option>
              <option value="confident">Confident</option>
              <option value="concise">Concise</option>
            </Select>
          </Field>
          <Field label="Invalid example" htmlFor="d-bad" error="This field is required">
            <Input id="d-bad" aria-invalid defaultValue="" />
          </Field>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-[14px]">
              <Checkbox checked={checked} onChange={(e) => setChecked(e.target.checked)} /> Mention on CV
            </label>
            <label className="flex items-center gap-2 text-[14px]">
              <Switch checked={checked} onCheckedChange={setChecked} /> Dark exports
            </label>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-text-2">Self rating</span>
            <RatingInput value={rating} onChange={setRating} />
          </div>
        </div>
      </Section>

      <Section title="Cards">
        <Card className="w-64">
          <CardHeader>
            <CardTitle>Static card</CardTitle>
            <CardDescription>A plain surface with a soft shadow.</CardDescription>
          </CardHeader>
          <CardContent className="text-[13.5px] text-text-2">Body content lives here.</CardContent>
        </Card>
        <Card hoverable className="w-64">
          <CardHeader>
            <CardTitle>Hover card</CardTitle>
            <CardDescription>Lifts on hover.</CardDescription>
          </CardHeader>
          <CardContent className="text-[13.5px] text-text-2">Try hovering me.</CardContent>
        </Card>
      </Section>

      <Section title="Alerts">
        <div className="grid w-full max-w-md gap-3">
          <Alert tone="info" title="Heads up">Company research makes one external call.</Alert>
          <Alert tone="success" title="Saved">Your profile was updated.</Alert>
          <Alert tone="warning" title="Quota low">Switch to a local provider for reliability.</Alert>
          <Alert tone="danger" title="Failed">Could not reach the model.</Alert>
        </div>
      </Section>

      <Section title="Feedback (toasts)">
        <Button variant="secondary" onClick={() => toast.success("Saved", "Profile updated")}>
          Success toast
        </Button>
        <Button variant="secondary" onClick={() => toast.danger("Error", "Something broke")}>
          Danger toast
        </Button>
        <Button variant="secondary" onClick={() => toast.info("FYI", "A neutral message")}>
          Info toast
        </Button>
      </Section>

      <Section title="Progress & loading">
        <div className="grid w-full max-w-md gap-3">
          <Progress value={35} aria-label="Demo" />
          <Progress value={70} tone="gold" aria-label="Demo" />
          <Progress value={92} tone="blue" aria-label="Demo" />
          <div className="flex items-center gap-4">
            <Spinner />
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        </div>
      </Section>

      <Section title="Score & avatars">
        <ScoreRing value={86} label="Match" />
        <ScoreRing value={62} />
        <ScoreRing value={38} />
        <Avatar name="Mehmet Erguden" />
        <Avatar name="Ada Lovelace" size={52} />
      </Section>

      <Section title="Tabs">
        <Tabs defaultValue="overview" className="w-full max-w-md">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="values">Values</TabsTrigger>
            <TabsTrigger value="tech">Tech stack</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="text-[13.5px] text-text-2">Company overview…</TabsContent>
          <TabsContent value="values" className="text-[13.5px] text-text-2">What they value…</TabsContent>
          <TabsContent value="tech" className="text-[13.5px] text-text-2">Their stack…</TabsContent>
        </Tabs>
      </Section>

      <Section title="Stepper">
        <Stepper
          className="w-64"
          current={2}
          steps={[
            { key: "cv", label: "Import CV" },
            { key: "profile", label: "Confirm profile" },
            { key: "research", label: "Research company" },
            { key: "write", label: "Generate letter" },
          ]}
        />
      </Section>

      <Section title="Table">
        <Table>
          <THead>
            <TR>
              <TH>Company</TH>
              <TH>Role</TH>
              <TH>Status</TH>
              <TH>Match</TH>
            </TR>
          </THead>
          <TBody>
            <TR>
              <TD className="text-text">Acme</TD>
              <TD>Frontend Engineer</TD>
              <TD><StatusBadge status="interview" /></TD>
              <TD>86</TD>
            </TR>
            <TR>
              <TD className="text-text">Globex</TD>
              <TD>Platform Intern</TD>
              <TD><StatusBadge status="sent" /></TD>
              <TD>71</TD>
            </TR>
          </TBody>
        </Table>
      </Section>

      <Section title="Overlays">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="secondary">Open dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Example dialog</DialogTitle>
              <DialogDescription>Radix-powered, styled to the design system.</DialogDescription>
            </DialogHeader>
            <p className="text-[14px] text-text-2">Dialog body content goes here.</p>
          </DialogContent>
        </Dialog>
        <Button variant="danger" onClick={() => setConfirm(true)}>
          Confirm dialog
        </Button>
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title="Delete this letter?"
          description="This can't be undone."
          destructive
          confirmLabel="Delete"
          onConfirm={() => {
            setConfirm(false);
            toast.success("Deleted");
          }}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost">
              <Sparkles size={16} /> Hover me
            </Button>
          </TooltipTrigger>
          <TooltipContent>A helpful tooltip</TooltipContent>
        </Tooltip>
      </Section>

      <Section title="Streaming text">
        <div className="w-full max-w-lg rounded-[var(--radius-card)] border border-border bg-paper p-5">
          <StreamingText text="Dear hiring team, I have long admired how your team ships" streaming />
        </div>
      </Section>

      <Section title="Dropzone & empty state">
        <div className="grid w-full max-w-md gap-4">
          <FileDropzone accept=".pdf" hint="PDF, DOCX or image · max 15 MB" onFile={() => {}} />
          <EmptyState
            icon={Github}
            title="No repositories yet"
            description="Connect your GitHub account to import projects."
            action={<Button size="sm">Connect GitHub</Button>}
          />
        </div>
      </Section>

      <Section title="Separator">
        <div className="w-full max-w-md">
          <p className="text-[13.5px] text-text-2">Above</p>
          <Separator className="my-3" />
          <p className="text-[13.5px] text-text-2">Below</p>
        </div>
      </Section>
    </div>
  );
}

/** Wraps the gallery in a forced theme so both can be compared at once. */
function ThemePanel({ theme }: { theme: "light" | "dark" }) {
  return (
    <div className={`${theme} rounded-[16px] border border-border bg-bg p-6`}>
      <div className="mb-5 flex items-center gap-2">
        <FileText size={15} className="text-accent-ink" />
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-text-2">
          {theme} theme
        </span>
      </div>
      <Gallery />
    </div>
  );
}

export function ComponentsShowcase() {
  return (
    <>
      <PageHeader
        eyebrow="Dev"
        title="Component gallery"
        description="Every primitive and composite, rendered in both themes side by side to catch drift."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <ThemePanel theme="light" />
        <ThemePanel theme="dark" />
      </div>
    </>
  );
}
