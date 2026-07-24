import { type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Award,
  BookOpen,
  ExternalLink,
  FolderGit2,
  GraduationCap,
  Languages as LanguagesIcon,
  Link2,
  Plus,
  Star,
  Trash2,
  UserRound,
  Wrench,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { Input, Textarea, Field } from "@/components/ui/field";
import { Toggle } from "@/components/ui/controls";
import { SearchSelect, TagField, DateField } from "@/components/ui/pickers";
import type { Profile } from "@/api/types";

/* ── Value helpers (the draft holds loosely-typed streamed objects) ── */
export type Item = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const numOr0 = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const isTrue = (v: unknown): boolean => v === true;
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const toTags = (v: unknown): string => list(v).join(", ");
const fromTags = (s: string): string[] => s.split(",").map((x) => x.trim()).filter(Boolean);
const titleCase = (v: string): string => v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const opts = (values: readonly string[]) => values.map((v) => ({ value: v, label: titleCase(v) }));

const EMPLOYMENT = opts(["full_time", "part_time", "internship", "freelance", "volunteer", "other"]);
const CERT_TYPES = opts(["professional", "course", "exam", "language", "award", "bootcamp", "other"]);
const LANG_LEVELS = opts(["native", "fluent", "professional", "intermediate", "basic"]);

const enter = {
  initial: { opacity: 0, y: 10, scale: 0.98, boxShadow: "0 0 0 2px var(--accent-weak)" },
  animate: { opacity: 1, y: 0, scale: 1, boxShadow: "0 0 0 0px transparent" },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.12 } },
  transition: { type: "spring" as const, stiffness: 460, damping: 34 },
};

function useOps(items: Item[], onChange: (items: Item[]) => void) {
  return {
    set: (i: number, patch: Item) => onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it))),
    remove: (i: number) => onChange(items.filter((_, idx) => idx !== i)),
    add: (init: Item = {}) => onChange([...items, init]),
  };
}

/* ── Shared shell ─────────────────────────────────────────────────── */
export function SectionShell({
  title,
  count,
  icon: Icon,
  onAdd,
  disabled,
  children,
}: {
  title: string;
  count: number;
  icon: LucideIcon;
  onAdd?: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[12px] border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-accent-weak">
          <Icon size={13} className="text-accent-text" aria-hidden="true" />
        </span>
        <span className="text-[12px] font-semibold text-fg">{title}</span>
        {count > 0 ? <span className="text-[11px] tabular-nums text-fg-low">· {count}</span> : null}
        {onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            disabled={disabled}
            className="ml-auto inline-flex items-center gap-1 text-[12px] font-semibold text-accent-text transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            <Plus size={13} /> Add
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="text-[12px] text-fg-low">{children}</p>;
}

/** Animated item row with a vertically-centered delete affordance on the right edge. */
function ItemRow({
  onRemove,
  removeLabel,
  disabled,
  children,
}: {
  onRemove: () => void;
  removeLabel: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <motion.div
      layout
      initial={enter.initial}
      animate={enter.animate}
      exit={enter.exit}
      transition={enter.transition}
      className="relative rounded-[10px] border border-border bg-input p-3 pr-12"
    >
      {children}
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={removeLabel}
        className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[8px] text-fg-low transition-colors hover:bg-danger-weak hover:text-danger focus-visible:bg-danger-weak focus-visible:text-danger focus-visible:outline-none disabled:opacity-40"
      >
        <Trash2 size={14} aria-hidden="true" />
      </button>
    </motion.div>
  );
}

function List({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <AnimatePresence initial={false}>{children}</AnimatePresence>
    </div>
  );
}

const labelCls = "mb-1 block text-[10.5px] font-semibold tracking-[0.01em] text-fg-low";
function Small({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  );
}

/** Interactive 0–5 star rating (click the current value to clear). */
function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Proficiency">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} of 5`}
          onClick={() => onChange(value === n ? 0 : n)}
          className="text-fg-low transition-colors hover:text-accent-text focus-visible:outline-none"
        >
          <Star size={16} className={n <= value ? "text-accent-text" : ""} fill={n <= value ? "var(--accent)" : "none"} strokeWidth={1.6} />
        </button>
      ))}
    </div>
  );
}

function DateRange({
  start,
  end,
  current,
  onStart,
  onEnd,
  onCurrent,
  currentLabel,
}: {
  start: string;
  end: string;
  current: boolean;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
  onCurrent: (v: boolean) => void;
  currentLabel: string;
}) {
  return (
    <div className="sm:col-span-2">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <Small label="Start">
          <DateField value={start} onChange={onStart} />
        </Small>
        <Small label={current ? "Present" : "End"}>
          {current ? (
            <div className="flex h-10 items-center rounded-[9px] border border-border bg-input px-3 text-[13px] text-fg-low">Present</div>
          ) : (
            <DateField value={end} onChange={onEnd} />
          )}
        </Small>
      </div>
      <label className="mt-2.5 flex items-center gap-2 text-[12px] text-fg-mid">
        <Toggle checked={current} onChange={onCurrent} aria-label={currentLabel} />
        {currentLabel}
      </label>
    </div>
  );
}

type EditorProps = { items: Item[]; disabled?: boolean; onChange: (items: Item[]) => void };

/* ── Details (profile) ────────────────────────────────────────────── */
const PROFILE_FIELDS: { key: keyof Profile; label: string; placeholder: string; type?: string; wide?: boolean; textarea?: boolean }[] = [
  { key: "name", label: "First name", placeholder: "Jane" },
  { key: "surname", label: "Last name", placeholder: "Doe" },
  { key: "email", label: "Email", placeholder: "jane@example.com", type: "email" },
  { key: "phone", label: "Phone", placeholder: "+1 555 0100", type: "tel" },
  { key: "linkedin", label: "LinkedIn", placeholder: "linkedin.com/in/jane" },
  { key: "github", label: "GitHub", placeholder: "github.com/jane" },
  { key: "summary", label: "Summary", placeholder: "A short professional summary…", wide: true, textarea: true },
];

export function DetailsEditor({ profile, disabled, onChange }: { profile: Profile; disabled?: boolean; onChange: (patch: Partial<Profile>) => void }) {
  return (
    <SectionShell title="Details" count={0} icon={UserRound}>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {PROFILE_FIELDS.map((f) => (
          <Field key={f.key} label={f.label} htmlFor={`p-${f.key}`} className={f.wide ? "sm:col-span-2" : undefined}>
            {f.textarea ? (
              <Textarea
                id={`p-${f.key}`}
                value={(profile[f.key] as string | null | undefined) ?? ""}
                placeholder={f.placeholder}
                disabled={disabled}
                onChange={(e) => onChange({ [f.key]: e.target.value || null } as Partial<Profile>)}
              />
            ) : (
              <Input
                id={`p-${f.key}`}
                type={f.type ?? "text"}
                value={(profile[f.key] as string | null | undefined) ?? ""}
                placeholder={f.placeholder}
                disabled={disabled}
                onChange={(e) => onChange({ [f.key]: e.target.value || null } as Partial<Profile>)}
              />
            )}
          </Field>
        ))}
      </div>
    </SectionShell>
  );
}

/* ── Skills ───────────────────────────────────────────────────────── */
export function SkillsEditor({ items, disabled, onChange }: EditorProps) {
  const ops = useOps(items, onChange);
  return (
    <SectionShell title="Skills" count={items.length} icon={Wrench} onAdd={() => ops.add()} disabled={disabled}>
      {items.length === 0 ? (
        <EmptyHint>No skills yet — add one.</EmptyHint>
      ) : (
        <List>
          {items.map((it, i) => (
            <ItemRow key={i} onRemove={() => ops.remove(i)} removeLabel="Remove skill" disabled={disabled}>
              <div className="grid grid-cols-1 items-end gap-2.5 sm:grid-cols-[1fr_auto]">
                <Small label="Skill">
                  <Input value={str(it.name)} placeholder="e.g. TypeScript" disabled={disabled} onChange={(e) => ops.set(i, { name: e.target.value || null })} />
                </Small>
                <div className="pb-1.5">
                  <StarRating value={numOr0(it.self_rating)} onChange={(v) => ops.set(i, { self_rating: v || null })} />
                </div>
              </div>
              <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <Small label="Category">
                  <Input value={str(it.category)} placeholder="Languages" disabled={disabled} onChange={(e) => ops.set(i, { category: e.target.value || null })} />
                </Small>
                <Small label="Years">
                  <Input
                    type="number"
                    value={typeof it.years_experience === "number" ? String(it.years_experience) : ""}
                    placeholder="0"
                    disabled={disabled}
                    onChange={(e) => ops.set(i, { years_experience: e.target.value ? Number(e.target.value) : null })}
                  />
                </Small>
                <Small label="Note">
                  <Input value={str(it.note)} placeholder="Optional" disabled={disabled} onChange={(e) => ops.set(i, { note: e.target.value || null })} />
                </Small>
              </div>
            </ItemRow>
          ))}
        </List>
      )}
    </SectionShell>
  );
}

/* ── Experience ───────────────────────────────────────────────────── */
export function ExperienceEditor({ items, disabled, onChange }: EditorProps) {
  const ops = useOps(items, onChange);
  return (
    <SectionShell title="Experience" count={items.length} icon={FileText} onAdd={() => ops.add()} disabled={disabled}>
      {items.length === 0 ? (
        <EmptyHint>No roles yet — add one.</EmptyHint>
      ) : (
        <List>
          {items.map((it, i) => (
            <ItemRow key={i} onRemove={() => ops.remove(i)} removeLabel="Remove role" disabled={disabled}>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Small label="Title">
                  <Input value={str(it.title)} placeholder="Software Engineer" disabled={disabled} onChange={(e) => ops.set(i, { title: e.target.value || null })} />
                </Small>
                <Small label="Company">
                  <Input value={str(it.company)} placeholder="Acme Inc." disabled={disabled} onChange={(e) => ops.set(i, { company: e.target.value || null })} />
                </Small>
                <Small label="Employment type">
                  <SearchSelect value={str(it.employment_type)} options={EMPLOYMENT} placeholder="Select…" onChange={(v) => ops.set(i, { employment_type: v || null })} />
                </Small>
                <Small label="Location">
                  <Input value={str(it.location)} placeholder="Remote · Istanbul" disabled={disabled} onChange={(e) => ops.set(i, { location: e.target.value || null })} />
                </Small>
                <DateRange
                  start={str(it.start_date)}
                  end={str(it.end_date)}
                  current={isTrue(it.is_current)}
                  currentLabel="I currently work here"
                  onStart={(v) => ops.set(i, { start_date: v || null })}
                  onEnd={(v) => ops.set(i, { end_date: v || null })}
                  onCurrent={(v) => ops.set(i, { is_current: v, end_date: v ? null : it.end_date })}
                />
                <div className="sm:col-span-2">
                  <Small label="What you did">
                    <Textarea className="min-h-[70px]" value={str(it.description)} placeholder="Impact, ownership, results…" disabled={disabled} onChange={(e) => ops.set(i, { description: e.target.value || null })} />
                  </Small>
                </div>
              </div>
            </ItemRow>
          ))}
        </List>
      )}
    </SectionShell>
  );
}

/* ── Education ─────────────────────────────────────────────────────── */
export function EducationEditor({ items, disabled, onChange }: EditorProps) {
  const ops = useOps(items, onChange);
  return (
    <SectionShell title="Education" count={items.length} icon={GraduationCap} onAdd={() => ops.add()} disabled={disabled}>
      {items.length === 0 ? (
        <EmptyHint>No education yet — add an entry.</EmptyHint>
      ) : (
        <List>
          {items.map((it, i) => (
            <ItemRow key={i} onRemove={() => ops.remove(i)} removeLabel="Remove education" disabled={disabled}>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Small label="Institution">
                  <Input value={str(it.institution)} placeholder="University" disabled={disabled} onChange={(e) => ops.set(i, { institution: e.target.value || null })} />
                </Small>
                <Small label="Degree">
                  <Input value={str(it.degree)} placeholder="B.S." disabled={disabled} onChange={(e) => ops.set(i, { degree: e.target.value || null })} />
                </Small>
                <Small label="Field of study">
                  <Input value={str(it.field)} placeholder="Computer Engineering" disabled={disabled} onChange={(e) => ops.set(i, { field: e.target.value || null })} />
                </Small>
                <Small label="GPA">
                  <Input value={str(it.gpa)} placeholder="3.8 / 4.0" disabled={disabled} onChange={(e) => ops.set(i, { gpa: e.target.value || null })} />
                </Small>
                <div className="sm:col-span-2">
                  <Small label="Location">
                    <Input value={str(it.location)} placeholder="City, Country" disabled={disabled} onChange={(e) => ops.set(i, { location: e.target.value || null })} />
                  </Small>
                </div>
                <DateRange
                  start={str(it.start_date)}
                  end={str(it.end_date)}
                  current={isTrue(it.is_current)}
                  currentLabel="Currently studying here"
                  onStart={(v) => ops.set(i, { start_date: v || null })}
                  onEnd={(v) => ops.set(i, { end_date: v || null })}
                  onCurrent={(v) => ops.set(i, { is_current: v, end_date: v ? null : it.end_date })}
                />
                <div className="sm:col-span-2">
                  <Small label="Relevant coursework">
                    <TagField value={toTags(it.courses)} placeholder="Add a course, press Enter" onChange={(v) => ops.set(i, { courses: fromTags(v) })} />
                  </Small>
                </div>
              </div>
            </ItemRow>
          ))}
        </List>
      )}
    </SectionShell>
  );
}

/* ── Projects ─────────────────────────────────────────────────────── */
export function ProjectsEditor({ items, disabled, onChange }: EditorProps) {
  const ops = useOps(items, onChange);
  return (
    <SectionShell title="Projects" count={items.length} icon={FolderGit2} onAdd={() => ops.add()} disabled={disabled}>
      {items.length === 0 ? (
        <EmptyHint>No projects yet — add one.</EmptyHint>
      ) : (
        <List>
          {items.map((it, i) => {
            const stars = typeof it.stars === "number" ? it.stars : null;
            return (
              <ItemRow key={i} onRemove={() => ops.remove(i)} removeLabel="Remove project" disabled={disabled}>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <Small label="Name">
                    <div className="flex items-center gap-2">
                      <Input value={str(it.name)} placeholder="Project name" disabled={disabled} onChange={(e) => ops.set(i, { name: e.target.value || null })} />
                      {stars != null ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-[7px] bg-warning-weak px-2 py-1 text-[11px] font-medium text-warning">
                          <Star size={11} fill="currentColor" strokeWidth={0} /> {stars}
                        </span>
                      ) : null}
                    </div>
                  </Small>
                  <Small label="Your role">
                    <Input value={str(it.role)} placeholder="Lead developer" disabled={disabled} onChange={(e) => ops.set(i, { role: e.target.value || null })} />
                  </Small>
                  <div className="sm:col-span-2">
                    <Small label="Technologies">
                      <TagField value={toTags(it.technologies)} placeholder="Add tech, press Enter" onChange={(v) => ops.set(i, { technologies: fromTags(v) })} />
                    </Small>
                  </div>
                  <Small label="URL">
                    <Input value={str(it.url)} placeholder="https://…" disabled={disabled} onChange={(e) => ops.set(i, { url: e.target.value || null })} />
                  </Small>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Small label="Start">
                      <DateField value={str(it.start_date)} onChange={(v) => ops.set(i, { start_date: v || null })} />
                    </Small>
                    <Small label="End">
                      <DateField value={str(it.end_date)} onChange={(v) => ops.set(i, { end_date: v || null })} />
                    </Small>
                  </div>
                  <div className="sm:col-span-2">
                    <Small label="Description">
                      <Textarea className="min-h-[64px]" value={str(it.description)} placeholder="What it does, what you built…" disabled={disabled} onChange={(e) => ops.set(i, { description: e.target.value || null })} />
                    </Small>
                  </div>
                </div>
              </ItemRow>
            );
          })}
        </List>
      )}
    </SectionShell>
  );
}

/* ── Certificates ─────────────────────────────────────────────────── */
export function CertificatesEditor({ items, disabled, onChange }: EditorProps) {
  const ops = useOps(items, onChange);
  return (
    <SectionShell title="Certificates" count={items.length} icon={Award} onAdd={() => ops.add()} disabled={disabled}>
      {items.length === 0 ? (
        <EmptyHint>No certificates yet — add one.</EmptyHint>
      ) : (
        <List>
          {items.map((it, i) => (
            <ItemRow key={i} onRemove={() => ops.remove(i)} removeLabel="Remove certificate" disabled={disabled}>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Small label="Name">
                  <Input value={str(it.name)} placeholder="AZ-900" disabled={disabled} onChange={(e) => ops.set(i, { name: e.target.value || null })} />
                </Small>
                <Small label="Issuer">
                  <Input value={str(it.issuer)} placeholder="Microsoft" disabled={disabled} onChange={(e) => ops.set(i, { issuer: e.target.value || null })} />
                </Small>
                <Small label="Type">
                  <SearchSelect value={str(it.cert_type)} options={CERT_TYPES} placeholder="Select…" onChange={(v) => ops.set(i, { cert_type: v || null })} />
                </Small>
                <Small label="Credential ID">
                  <Input value={str(it.credential_id)} placeholder="ABC-123" disabled={disabled} onChange={(e) => ops.set(i, { credential_id: e.target.value || null })} />
                </Small>
                <Small label="Issued">
                  <DateField value={str(it.issue_date)} onChange={(v) => ops.set(i, { issue_date: v || null })} />
                </Small>
                <Small label="Expires">
                  <DateField value={str(it.expiry_date)} onChange={(v) => ops.set(i, { expiry_date: v || null })} />
                </Small>
                <div className="sm:col-span-2">
                  <Small label="URL">
                    <Input value={str(it.url)} placeholder="https://credential…" disabled={disabled} onChange={(e) => ops.set(i, { url: e.target.value || null })} />
                  </Small>
                </div>
              </div>
            </ItemRow>
          ))}
        </List>
      )}
    </SectionShell>
  );
}

/* ── Training ─────────────────────────────────────────────────────── */
export function TrainingEditor({ items, disabled, onChange }: EditorProps) {
  const ops = useOps(items, onChange);
  return (
    <SectionShell title="Training" count={items.length} icon={BookOpen} onAdd={() => ops.add()} disabled={disabled}>
      {items.length === 0 ? (
        <EmptyHint>No training yet — add one.</EmptyHint>
      ) : (
        <List>
          {items.map((it, i) => (
            <ItemRow key={i} onRemove={() => ops.remove(i)} removeLabel="Remove training" disabled={disabled}>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Small label="Name">
                  <Input value={str(it.name)} placeholder="Course name" disabled={disabled} onChange={(e) => ops.set(i, { name: e.target.value || null })} />
                </Small>
                <Small label="Provider">
                  <Input value={str(it.provider)} placeholder="Coursera" disabled={disabled} onChange={(e) => ops.set(i, { provider: e.target.value || null })} />
                </Small>
                <Small label="Completed">
                  <DateField value={str(it.completion_date)} onChange={(v) => ops.set(i, { completion_date: v || null })} />
                </Small>
                <Small label="URL">
                  <Input value={str(it.url)} placeholder="https://…" disabled={disabled} onChange={(e) => ops.set(i, { url: e.target.value || null })} />
                </Small>
                <div className="sm:col-span-2">
                  <Small label="Description">
                    <Textarea className="min-h-[60px]" value={str(it.description)} placeholder="What you learned…" disabled={disabled} onChange={(e) => ops.set(i, { description: e.target.value || null })} />
                  </Small>
                </div>
              </div>
            </ItemRow>
          ))}
        </List>
      )}
    </SectionShell>
  );
}

/* ── Languages (wrapping grid of compact rows) ───────────────────── */
export function LanguagesEditor({ items, disabled, onChange }: EditorProps) {
  const ops = useOps(items, onChange);
  return (
    <SectionShell title="Languages" count={items.length} icon={LanguagesIcon} onAdd={() => ops.add()} disabled={disabled}>
      {items.length === 0 ? (
        <EmptyHint>No languages yet — add one.</EmptyHint>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <AnimatePresence initial={false}>
            {items.map((it, i) => (
              <motion.div
                key={i}
                layout
                initial={enter.initial}
                animate={enter.animate}
                exit={enter.exit}
                transition={enter.transition}
                className="relative flex items-center gap-2 rounded-[10px] border border-border bg-input p-2.5 pr-11"
              >
                <Input className="flex-1" value={str(it.name)} placeholder="Language" disabled={disabled} onChange={(e) => ops.set(i, { name: e.target.value || null })} />
                <div className="w-[130px] shrink-0">
                  <SearchSelect value={str(it.proficiency)} options={LANG_LEVELS} placeholder="Level" onChange={(v) => ops.set(i, { proficiency: v || null })} />
                </div>
                <button
                  type="button"
                  onClick={() => ops.remove(i)}
                  disabled={disabled}
                  aria-label="Remove language"
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[8px] text-fg-low transition-colors hover:bg-danger-weak hover:text-danger focus-visible:bg-danger-weak focus-visible:text-danger focus-visible:outline-none disabled:opacity-40"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </SectionShell>
  );
}

/* ── Links ────────────────────────────────────────────────────────── */
export function LinksEditor({ items, disabled, onChange }: EditorProps) {
  const ops = useOps(items, onChange);
  return (
    <SectionShell title="Links" count={items.length} icon={Link2} onAdd={() => ops.add()} disabled={disabled}>
      {items.length === 0 ? (
        <EmptyHint>No links yet — add one.</EmptyHint>
      ) : (
        <List>
          {items.map((it, i) => {
            const url = str(it.url);
            const href = url ? (/^https?:\/\//i.test(url) ? url : `https://${url}`) : null;
            return (
              <ItemRow key={i} onRemove={() => ops.remove(i)} removeLabel="Remove link" disabled={disabled}>
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-border bg-surface-2 text-fg-mid">
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-fg-mid transition-colors hover:text-accent-text" aria-label="Open link">
                        <ExternalLink size={14} />
                      </a>
                    ) : (
                      <Link2 size={14} />
                    )}
                  </span>
                  <div className="grid min-w-0 flex-1 grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <Input value={str(it.label)} placeholder="Label (Portfolio)" disabled={disabled} onChange={(e) => ops.set(i, { label: e.target.value || null })} />
                    <Input value={url} placeholder="https://…" disabled={disabled} onChange={(e) => ops.set(i, { url: e.target.value || null })} />
                  </div>
                </div>
                <div className="mt-2.5">
                  <Input value={str(it.description)} placeholder="Optional note" disabled={disabled} onChange={(e) => ops.set(i, { description: e.target.value || null })} />
                </div>
              </ItemRow>
            );
          })}
        </List>
      )}
    </SectionShell>
  );
}
