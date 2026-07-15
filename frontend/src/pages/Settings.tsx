import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Eye, EyeOff, Plus, ShieldCheck, X } from "lucide-react";
import { Page } from "@/components/common/Page";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Toggle } from "@/components/ui/controls";
import { StatDot } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

/* ── State model ─────────────────────────────────────────────────
   Backend wiring is deferred. Everything here is local `useState` over
   the design's own placeholder data. The left-nav drives the visible tab;
   the provider selection drives the "cloud" state (which reveals the API
   key pool + swaps the privacy banner). No backend calls. */
type Tab = "model" | "integrations" | "data";
type ProviderId = "foundry" | "ollama" | "lmstudio" | "openai" | "claude" | "gemini";
type KeyMode = "auto" | "manual";
type AutocompleteSource = "wikidata" | "brandfetch";

type Provider = {
  id: ProviderId;
  name: string;
  desc: string;
  badge: string;
  cloud: boolean;
  baseUrl: string;
  models: string[];
};

const PROVIDERS: Provider[] = [
  {
    id: "foundry",
    name: "Foundry Local",
    desc: "Microsoft's on-device runtime. Private by default.",
    badge: "DEFAULT",
    cloud: false,
    baseUrl: "http://localhost:5272/v1",
    models: ["phi-4", "phi-3.5-mini", "qwen2.5-7b", "mistral-7b", "llama-3.2-3b"],
  },
  {
    id: "ollama",
    name: "Ollama",
    desc: "Run open models locally with a single command.",
    badge: "LOCAL",
    cloud: false,
    baseUrl: "http://localhost:11434",
    models: ["llama3.1:8b", "mistral:7b", "qwen2.5:14b", "gemma2:9b", "phi3.5"],
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    desc: "Local model server with a friendly desktop UI.",
    badge: "LOCAL",
    cloud: false,
    baseUrl: "http://localhost:1234/v1",
    models: ["llama-3.1-8b-instruct", "mistral-nemo", "qwen2.5-coder", "gemma-2-9b", "phi-3.5"],
  },
  {
    id: "openai",
    name: "OpenAI",
    desc: "GPT-4o and o-series models via your API key.",
    badge: "CLOUD",
    cloud: true,
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "o3-mini", "o1"],
  },
  {
    id: "claude",
    name: "Claude",
    desc: "Anthropic's Claude models via your API key.",
    badge: "CLOUD",
    cloud: true,
    baseUrl: "https://api.anthropic.com",
    models: ["claude-opus-4", "claude-sonnet-4", "claude-3.5-sonnet", "claude-3.5-haiku", "claude-3-opus"],
  },
  {
    id: "gemini",
    name: "Gemini",
    desc: "Google's Gemini with automatic key-pool rotation.",
    badge: "CLOUD",
    cloud: true,
    baseUrl: "https://generativelanguage.googleapis.com",
    models: ["gemini-2.0-flash", "gemini-2.0-pro", "gemini-1.5-pro", "gemini-1.5-flash", "gemini-1.5-flash-8b"],
  },
];

type KeyEntry = { id: string; masked: string; full: string; status: "active" | "standby" };

/* Placeholder key pools per cloud provider — the design shows a rotating
   pool with one ACTIVE key and the rest on STANDBY. */
const KEY_POOLS: Partial<Record<ProviderId, KeyEntry[]>> = {
  openai: [
    { id: "o1", masked: "sk-··················4a2f", full: "sk-proj-Kd8Fa2Lm9Qp3Rs7Tv1Wx4a2f", status: "active" },
    { id: "o2", masked: "sk-··················9c71", full: "sk-proj-Zn6Bh4Jc2Md8Pe0Rf5Sg9c71", status: "standby" },
  ],
  claude: [
    { id: "c1", masked: "sk-ant-···············3d8a", full: "sk-ant-api03-9Fk2Lm7Qp4Rs8Tv1Wx3d8a", status: "active" },
    { id: "c2", masked: "sk-ant-···············7c02", full: "sk-ant-api03-2Bh6Jc4Md8Pe0Rf5Sg7c02", status: "standby" },
  ],
  gemini: [
    { id: "g1", masked: "AIza···················Xy4", full: "AIzaSyD9Fk2Lm7Qp4Rs8Tv1Wx3zXy4", status: "active" },
    { id: "g2", masked: "AIza···················Qm7", full: "AIzaSyB2Bh6Jc4Md8Pe0Rf5Sg9dQm7", status: "standby" },
    { id: "g3", masked: "AIza···················Lp8", full: "AIzaSyC5Rt9Nk3Md7Pe1Qf6Sh2wLp8", status: "standby" },
  ],
};

const EMBED_MODELS = ["nomic-embed-text", "all-MiniLM-L6-v2", "mxbai-embed-large", "bge-small-en-v1.5"];

const STORAGE_ROWS: { label: string; size: string }[] = [
  { label: "Profile & skills", size: "18 KB" },
  { label: "Cover letters · 4", size: "42 KB" },
  { label: "Research cache", size: "1.2 MB" },
];

const NAV: { value: Tab; label: string }[] = [
  { value: "model", label: "Model & inference" },
  { value: "integrations", label: "Integrations" },
  { value: "data", label: "Data" },
];

const TAVILY_KEY = { masked: "tvly-··············7f3a", full: "tvly-a1b2c3d4e5f6g7h87f3a" };
const BRANDFETCH_ID = { masked: "id_··········9k2", full: "id_1a2b3c4d5e9k2" };

/* ── Page ────────────────────────────────────────────────────────── */
export function Settings() {
  const [tab, setTab] = useState<Tab>("model");
  const [providerId, setProviderId] = useState<ProviderId>("ollama");
  const [model, setModel] = useState("llama3.1:8b");
  const [keyMode, setKeyMode] = useState<KeyMode>("auto");
  const [reveal, setReveal] = useState(false);
  const [embedModel, setEmbedModel] = useState("nomic-embed-text");
  const [autocompleteSrc, setAutocompleteSrc] = useState<AutocompleteSource>("wikidata");
  const [ocr, setOcr] = useState(true);
  const [resetOpen, setResetOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => () => { if (toastTimer.current) window.clearTimeout(toastTimer.current); }, []);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  };

  const provider = PROVIDERS.find((p) => p.id === providerId)!;
  const keyPool = KEY_POOLS[provider.id] ?? [];

  const selectProvider = (p: Provider) => {
    setProviderId(p.id);
    setModel(p.models[0]);
  };

  return (
    <Page eyebrow="SETUP / SETTINGS" title="Settings" bodyClassName="px-7 py-5">
      <div className="grid grid-cols-[210px_1fr] gap-6">
        {/* Left nav */}
        <nav className="flex flex-col gap-[3px]">
          {NAV.map((n) => (
            <NavTab key={n.value} active={tab === n.value} onClick={() => setTab(n.value)}>
              {n.label}
            </NavTab>
          ))}
        </nav>

        {/* Content */}
        <div className="min-w-0">
          {tab === "model" ? (
            <div key="model" className="cll-fade flex flex-col gap-[22px]">
              {/* Provider grid */}
              <section>
                <h2 className="text-[14px] font-semibold text-fg">Inference provider</h2>
                <p className="mb-3.5 mt-1 text-[12px] text-fg-mid">
                  Choose where generation runs. Local providers keep everything on-device.
                </p>
                <div className="grid grid-cols-3 gap-2.5">
                  {PROVIDERS.map((p) => (
                    <ProviderCard key={p.id} provider={p} active={p.id === providerId} onClick={() => selectProvider(p)} />
                  ))}
                </div>
              </section>

              {/* Model + base URL */}
              <div className="grid grid-cols-2 gap-3.5">
                <Field label="MODEL">
                  <ModelSelect value={model} options={provider.models} onChange={setModel} />
                </Field>
                <Field label="BASE URL">
                  <div className="rounded-[10px] border border-border bg-input px-3.5 py-3 font-mono text-[13px] text-fg-mid">
                    {provider.baseUrl}
                  </div>
                </Field>
              </div>

              {/* Connection status */}
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" size="sm" onClick={() => showToast("Connection healthy · 42ms")}>
                  Test connection
                </Button>
                <span
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[10px] text-success"
                  style={{ background: "rgba(52,211,153,.12)" }}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-success" style={{ boxShadow: "0 0 8px var(--success)" }} />
                  HEALTHY · 42ms
                </span>
                {!provider.cloud ? (
                  <span className="text-[11px] text-fg-low">3 local models discovered</span>
                ) : (
                  <span className="text-[11px] text-fg-low">Using your API key</span>
                )}
              </div>

              {/* Cloud key pool — only when a cloud provider is selected */}
              {provider.cloud ? (
                <section>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[14px] font-semibold text-fg">{provider.name} keys</span>
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => setReveal((r) => !r)}
                        className="flex items-center gap-1.5 rounded-[8px] border border-border-strong bg-surface px-2.5 py-1.5 text-[11px] text-fg-mid transition-colors hover:text-fg"
                      >
                        {reveal ? <EyeOff size={13} /> : <Eye size={13} />}
                        {reveal ? "Hide" : "Show"}
                      </button>
                      <PillToggle
                        value={keyMode}
                        onChange={setKeyMode}
                        options={[
                          { value: "auto", label: "Auto" },
                          { value: "manual", label: "Manual" },
                        ]}
                      />
                    </div>
                  </div>
                  <p className="mb-3 text-[12px] text-fg-mid">Add several keys — rotates automatically on rate limits.</p>
                  <div className="flex flex-col gap-2">
                    {keyPool.map((k) => (
                      <KeyRow key={k.id} value={reveal ? k.full : k.masked} status={k.status} />
                    ))}
                    <AddKeyButton onClick={() => showToast("Key rotation is wired to the backend soon")} />
                  </div>
                </section>
              ) : null}

              {/* Privacy banner (adapts to local vs cloud state) */}
              {provider.cloud ? (
                <div className="flex items-start gap-3 rounded-[12px] border border-[color:var(--warning)]/30 bg-warning-weak p-4">
                  <AlertTriangle size={20} strokeWidth={1.6} className="shrink-0 text-warning" />
                  <div>
                    <div className="text-[13px] font-semibold text-warning">Prompts leave this device</div>
                    <p className="mt-1 text-[12px] leading-relaxed text-fg-mid">
                      With {provider.name} selected, your prompt and CV context are sent to {provider.name}. Everything else
                      stays local — only a company name is ever sent for research.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 rounded-[12px] border border-border bg-accent-weak p-4">
                  <ShieldCheck size={20} strokeWidth={1.6} className="shrink-0 text-accent" />
                  <div>
                    <div className="text-[13px] font-semibold text-fg">Everything runs on-device</div>
                    <p className="mt-1 text-[12px] leading-relaxed text-fg-mid">
                      With a local provider selected, your CV, profile, and generated letters never leave this machine. Only a
                      company name is sent for research.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {tab === "integrations" ? (
            <div key="integrations" className="cll-fade">
              <h2 className="mb-3 text-[14px] font-semibold text-fg">Integrations</h2>
              <div className="flex flex-col gap-2.5">
                <Row>
                  <span className="text-[13px] text-fg">Embedding model</span>
                  <EmbeddingSelect value={embedModel} options={EMBED_MODELS} onChange={setEmbedModel} />
                </Row>

                <Row>
                  <span className="text-[13px] text-fg">
                    Tavily key <span className="text-[11px] text-fg-low">· research</span>
                  </span>
                  <span className="flex items-center gap-2.5">
                    <span className="font-mono text-[11px] text-fg-mid">{reveal ? TAVILY_KEY.full : TAVILY_KEY.masked}</span>
                    <RevealButton revealed={reveal} onClick={() => setReveal((r) => !r)} />
                  </span>
                </Row>

                <Row>
                  <span className="text-[13px] text-fg">Autocomplete source</span>
                  <PillToggle
                    value={autocompleteSrc}
                    onChange={setAutocompleteSrc}
                    options={[
                      { value: "wikidata", label: "Wikidata" },
                      { value: "brandfetch", label: "Brandfetch" },
                    ]}
                  />
                </Row>

                <Row>
                  <span className="text-[13px] text-fg">Brandfetch client id</span>
                  <span className="flex items-center gap-2.5">
                    <span className="font-mono text-[11px] text-fg-mid">{reveal ? BRANDFETCH_ID.full : BRANDFETCH_ID.masked}</span>
                    <RevealButton revealed={reveal} onClick={() => setReveal((r) => !r)} />
                  </span>
                </Row>

                <Row>
                  <span className="text-[13px] text-fg">GitHub token</span>
                  <span className="font-mono text-[11px] text-success">connected ✓</span>
                </Row>

                <Row>
                  <span className="text-[13px] text-fg">OCR for scanned CVs</span>
                  <Toggle checked={ocr} onChange={setOcr} aria-label="OCR for scanned CVs" />
                </Row>
              </div>
            </div>
          ) : null}

          {tab === "data" ? (
            <div key="data" className="cll-fade flex flex-col gap-4">
              <div className="rounded-[12px] border border-border bg-surface p-[18px]">
                <div className="mb-3 font-mono text-[10px] tracking-[1px] text-fg-low">STORED ON THIS DEVICE</div>
                <div className="flex flex-col gap-2.5 text-[13px]">
                  {STORAGE_ROWS.map((r) => (
                    <div key={r.label} className="flex justify-between text-fg">
                      <span>{r.label}</span>
                      <span className="font-mono text-fg-mid">{r.size}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div
                className="rounded-[12px] border p-4"
                style={{ background: "rgba(251,113,133,.06)", borderColor: "rgba(251,113,133,.25)" }}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[13px] font-semibold text-danger">Reset all data</div>
                    <div className="mt-[3px] text-[12px] text-fg-mid">
                      Deletes your profile, letters, and cache. This can't be undone.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setResetOpen(true)}
                    className="shrink-0 rounded-[9px] border bg-transparent px-4 py-2 text-[12.5px] font-semibold text-danger transition-colors hover:bg-danger-weak"
                    style={{ borderColor: "var(--danger)" }}
                  >
                    Reset…
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Reset confirmation modal */}
      {resetOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/60" onClick={() => setResetOpen(false)} />
          <div
            className="relative w-full max-w-[420px] rounded-[16px] border border-border-strong bg-surface-2 p-6 shadow-[0_24px_54px_-20px_rgba(0,0,0,.8)]"
            style={{ animation: "cll-menu .16s ease" }}
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-danger-weak text-danger">
                <AlertTriangle size={18} strokeWidth={1.7} />
              </span>
              <div className="text-[15px] font-bold text-fg">Reset all data?</div>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-fg-mid">
              This permanently deletes your profile, skills, cover letters, and the research cache from this device. This
              can't be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2.5">
              <Button variant="outline" size="sm" onClick={() => setResetOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setResetOpen(false);
                  showToast("Reset runs once the backend is wired");
                }}
              >
                Delete everything
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Toast */}
      {toast ? (
        <div
          className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2"
          style={{ animation: "cll-menu .18s ease" }}
        >
          <div className="flex items-center gap-2 rounded-[11px] border border-border-strong bg-surface-2 px-4 py-2.5 text-[12.5px] text-fg shadow-[0_20px_44px_-18px_rgba(0,0,0,.7)]">
            <StatDot tone="success" glow size={7} />
            {toast}
          </div>
        </div>
      ) : null}
    </Page>
  );
}

/* ── Left-nav tab ────────────────────────────────────────────────── */
function NavTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[9px] px-3 py-2.5 text-left text-[13px] transition-colors",
        active ? "bg-accent-weak font-semibold text-accent-text" : "text-fg-mid hover:bg-surface-2 hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

/* ── Provider card ───────────────────────────────────────────────── */
function ProviderCard({ provider, active, onClick }: { provider: Provider; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col rounded-[12px] border p-3.5 text-left transition-colors",
        active ? "border-accent bg-accent-weak" : "border-border bg-surface hover:border-border-strong",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13.5px] font-semibold text-fg">{provider.name}</span>
        {active ? (
          <span
            className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
            style={{ background: "var(--accent-grad)" }}
          >
            <Check size={10} strokeWidth={3} className="text-white" />
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-[11px] leading-[1.45] text-fg-mid">{provider.desc}</p>
      <span className="mt-[9px] inline-block self-start rounded-full bg-accent-weak px-2 py-0.5 font-mono text-[8.5px] text-accent-text">
        {provider.badge}
      </span>
    </button>
  );
}

/* ── Searchable model dropdown ───────────────────────────────────── */
function ModelSelect({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const matches = options.filter((m) => m.toLowerCase().includes(query.toLowerCase()));
  const close = () => {
    setOpen(false);
    setQuery("");
  };
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-[10px] border border-border-strong bg-input px-3.5 py-3 text-[13px] text-fg transition-colors hover:border-accent"
      >
        {value}
        <ChevronDown size={16} className="text-fg-mid" />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-30" onClick={close} />
          <div
            className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 rounded-[11px] border border-border-strong bg-surface-2 p-1.5 shadow-[0_20px_44px_-18px_rgba(0,0,0,.7)]"
            style={{ animation: "cll-menu .18s ease" }}
          >
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models…"
              className="mb-1.5 w-full rounded-[8px] border border-border bg-input px-2.5 py-2 text-[12px] text-fg placeholder:text-fg-low outline-none focus:border-accent"
            />
            <div className="max-h-[176px] overflow-auto">
              {matches.length ? (
                matches.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      onChange(m);
                      close();
                    }}
                    className={cn(
                      "block w-full rounded-[8px] px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-accent-weak",
                      m === value ? "text-accent-text" : "text-fg",
                    )}
                  >
                    {m}
                  </button>
                ))
              ) : (
                <div className="px-2.5 py-2 text-[12px] text-fg-low">{`No models match "${query}".`}</div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ── Compact inline dropdown (embedding model) ───────────────────── */
function EmbeddingSelect({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 font-mono text-[11px] text-fg-mid transition-colors hover:text-fg"
      >
        {value}
        <ChevronDown size={13} />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-[calc(100%+6px)] z-40 w-[220px] rounded-[11px] border border-border-strong bg-surface-2 p-1.5 shadow-[0_20px_44px_-18px_rgba(0,0,0,.7)]"
            style={{ animation: "cll-menu .18s ease" }}
          >
            {options.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  onChange(m);
                  setOpen(false);
                }}
                className={cn(
                  "block w-full rounded-[8px] px-2.5 py-2 text-left font-mono text-[12px] transition-colors hover:bg-accent-weak",
                  m === value ? "text-accent-text" : "text-fg-mid",
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ── Compact pill toggle (Auto/Manual, Wikidata/Brandfetch) ──────── */
function PillToggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex gap-[3px] rounded-[9px] border border-border bg-input p-[3px]">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-[7px] px-2.5 py-1 text-[11px] font-medium transition-colors",
              active ? "text-white" : "text-fg-mid hover:text-fg",
            )}
            style={active ? { background: "var(--accent-grad)" } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── API key row ─────────────────────────────────────────────────── */
function KeyRow({ value, status }: { value: string; status: "active" | "standby" }) {
  const active = status === "active";
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[10px] border bg-surface px-3.5 py-3",
        active ? "border-accent" : "border-border",
      )}
    >
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
          active ? "border-accent" : "border-border-strong",
        )}
      >
        {active ? <span className="h-[7px] w-[7px] rounded-full bg-accent" /> : null}
      </span>
      <span className={cn("flex-1 truncate font-mono text-[12px]", active ? "text-fg" : "text-fg-mid")}>{value}</span>
      <span className={cn("font-mono text-[10px]", active ? "text-success" : "text-fg-low")}>
        {active ? "ACTIVE" : "STANDBY"}
      </span>
      <button type="button" className="p-0.5 text-fg-low transition-colors hover:text-fg" aria-label="Remove key">
        <X size={15} strokeWidth={1.6} />
      </button>
    </div>
  );
}

function AddKeyButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-[10px] border border-dashed border-border-strong bg-transparent px-3.5 py-2.5 text-[12.5px] text-accent-text transition-colors hover:border-accent"
    >
      <Plus size={14} strokeWidth={1.8} />
      Add key
    </button>
  );
}

/* ── Reveal (eye) toggle ─────────────────────────────────────────── */
function RevealButton({ revealed, onClick }: { revealed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex text-fg-low transition-colors hover:text-fg"
      aria-label={revealed ? "Hide value" : "Show value"}
    >
      {revealed ? <EyeOff size={15} strokeWidth={1.5} /> : <Eye size={15} strokeWidth={1.5} />}
    </button>
  );
}

/* ── Integrations row shell ──────────────────────────────────────── */
function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[10px] border border-border bg-surface px-3.5 py-3">
      {children}
    </div>
  );
}
