import { useEffect, useState } from "react";
import {
  CheckCircle2, Cpu, Eye, Globe2, HardDrive, Loader2, RefreshCw, Save, ShieldCheck,
  SlidersHorizontal, Trash2, TriangleAlert,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { AsyncBoundary } from "@/components/common/AsyncBoundary";
import { ResetDataDialog } from "@/components/common/ResetDataDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { GeminiKeys } from "@/components/settings/GeminiKeys";
import { FoundryModels } from "@/components/settings/FoundryModels";
import type { GeminiKeyConfig, LLMProviderId, Settings as SettingsType } from "@/api/types";
import { getSettings, saveSettings } from "@/api/settings";
import { listModels } from "@/api/llm";
import { errorMessage } from "@/api/client";
import { useAsync } from "@/lib/useAsync";
import { toast } from "@/store/toast";

type ProviderInfo = {
  id: LLMProviderId;
  label: string;
  local: boolean;
  baseUrl: string; // sensible default endpoint (local providers)
  models: string[]; // pickable models; local users can still choose "Custom…"
};

const PROVIDERS: ProviderInfo[] = [
  {
    id: "foundry_local",
    label: "Foundry Local",
    local: true,
    baseUrl: "http://localhost:5273/v1",
    models: ["phi-4", "phi-3.5-mini", "qwen2.5-7b-instruct", "mistral-7b-instruct"],
  },
  {
    id: "ollama",
    label: "Ollama",
    local: true,
    baseUrl: "http://localhost:11434",
    models: ["llama3.1:8b", "qwen2.5:7b", "qwen2.5:14b", "gemma2:9b", "mistral", "phi3.5"],
  },
  {
    id: "openai",
    label: "OpenAI",
    local: false,
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "o3-mini"],
  },
  {
    id: "anthropic",
    label: "Claude (Anthropic)",
    local: false,
    baseUrl: "https://api.anthropic.com",
    models: ["claude-sonnet-4-5", "claude-opus-4-1", "claude-3-5-haiku-latest"],
  },
  {
    id: "gemini",
    label: "Gemini",
    local: false,
    baseUrl: "https://generativelanguage.googleapis.com",
    models: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro", "gemini-2.0-flash"],
  },
];

const CUSTOM = "__custom__";

export function Settings() {
  const loaded = useAsync(getSettings, []);
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [saving, setSaving] = useState(false);
  const [discovered, setDiscovered] = useState<{ models: string[]; error: string | null; loading: boolean }>({
    models: [],
    error: null,
    loading: false,
  });
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    if (loaded.data) setSettings(loaded.data);
  }, [loaded.data]);

  const provider = settings ? PROVIDERS.find((p) => p.id === settings.llm_provider) : undefined;
  const isCloud = provider ? !provider.local : false;
  const isFoundry = settings?.llm_provider === "foundry_local";

  function set<K extends keyof SettingsType>(key: K, value: SettingsType[K]) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  // The Gemini key pool persists itself via its own endpoints; mirror each change
  // into `settings` so the main Save stays consistent, and re-run model discovery
  // (the active key just changed, so different models may become reachable).
  function applyGemini(cfg: GeminiKeyConfig) {
    setSettings((prev) =>
      prev
        ? { ...prev, gemini_api_keys: cfg.keys, gemini_active_key_id: cfg.active_id, key_switch_mode: cfg.mode }
        : prev,
    );
    setRefreshNonce((n) => n + 1);
  }

  // Switching provider auto-selects that provider's default model and endpoint.
  function changeProvider(id: LLMProviderId) {
    const info = PROVIDERS.find((p) => p.id === id)!;
    setSettings((prev) =>
      prev ? { ...prev, llm_provider: id, llm_model: info.models[0]!, llm_base_url: info.baseUrl } : prev,
    );
  }

  // Discover models for the current provider (debounced on provider/base-URL change).
  const prov = settings?.llm_provider;
  const base = settings?.llm_base_url;
  useEffect(() => {
    if (!prov) return;
    setDiscovered((d) => ({ ...d, loading: true }));
    const t = window.setTimeout(() => {
      listModels(prov, base)
        .then((r) => setDiscovered({ models: r.models, error: r.error, loading: false }))
        .catch((err) => setDiscovered({ models: [], error: errorMessage(err), loading: false }));
    }, 350);
    return () => window.clearTimeout(t);
  }, [prov, base, refreshNonce]);

  const curated = provider?.models ?? [];
  const modelOptions = discovered.models.length ? discovered.models : curated;
  const isCustomModel = settings != null && !modelOptions.includes(settings.llm_model);

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      await saveSettings(settings);
      toast.success("Settings saved", "Stored locally in your database.");
    } catch (err) {
      toast.error(err, "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="System"
        title="Settings"
        icon={SlidersHorizontal}
        description="Choose your model and keys. Everything is stored locally in your database — never in a file or the cloud."
        actions={
          <Button onClick={save} loading={saving} disabled={!settings}>
            <Save size={16} /> Save
          </Button>
        }
      />

      <AsyncBoundary loading={loaded.loading} error={loaded.error} onRetry={loaded.reload}>
        {settings && (
      <div className="grid max-w-2xl gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Language model</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Provider" htmlFor="provider">
              <Select
                id="provider"
                value={settings.llm_provider}
                onChange={(e) => changeProvider(e.target.value as LLMProviderId)}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} {p.local ? "· local" : "· cloud"}
                  </option>
                ))}
              </Select>
            </Field>

            {isCloud && (
              <Alert tone="warning" title="Cloud provider selected">
                Prompts (including your profile) will be sent to {provider?.label}. Local providers keep
                everything on your device.
              </Alert>
            )}

            {isFoundry ? (
              <>
                {/* Foundry Local is the private default — lead with the on-device story */}
                <div className="flex items-start gap-3 rounded-[12px] border border-accent/30 bg-accent-soft/50 px-4 py-3.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent-ink">
                    <Cpu size={18} />
                  </span>
                  <div className="min-w-0 text-[13px] leading-snug text-text-2">
                    <p className="text-[13.5px] font-semibold text-text">Runs on your device</p>
                    <p className="mt-0.5">
                      Powered by Microsoft Foundry Local on ONNX Runtime — no API key, no cloud. Your CV,
                      profile, and letters never leave this machine.
                    </p>
                  </div>
                </div>

                <FoundryModels
                  baseUrl={settings.llm_base_url}
                  selected={settings.llm_model}
                  onSelect={(m) => set("llm_model", m)}
                />
              </>
            ) : (
              <>
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-text">Model</span>
                    <button
                      type="button"
                      onClick={() => setRefreshNonce((n) => n + 1)}
                      className="inline-flex items-center gap-1 text-[12px] font-semibold text-text-2 transition-colors hover:text-accent-ink"
                    >
                      <RefreshCw size={12} className={discovered.loading ? "animate-spin" : undefined} /> Refresh
                    </button>
                  </div>
                  <Select
                    id="model"
                    value={isCustomModel ? CUSTOM : settings.llm_model}
                    onChange={(e) => set("llm_model", e.target.value === CUSTOM ? "" : e.target.value)}
                  >
                    {modelOptions.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                    <option value={CUSTOM}>Custom…</option>
                  </Select>
                  <p className="flex items-center gap-1.5 text-[12px] text-text-3">
                    {discovered.loading ? (
                      <><Loader2 size={12} className="animate-spin" /> Detecting available models…</>
                    ) : discovered.error ? (
                      <span className="flex items-center gap-1.5 text-gold"><TriangleAlert size={12} /> {discovered.error} Showing common models.</span>
                    ) : discovered.models.length ? (
                      <span className="flex items-center gap-1.5 text-good"><CheckCircle2 size={12} /> {discovered.models.length} model{discovered.models.length > 1 ? "s" : ""} detected {provider?.local ? "on this machine" : "for your account"}.</span>
                    ) : (
                      <>Pick a model, or choose Custom to enter one.</>
                    )}
                  </p>
                </div>

                {isCustomModel && (
                  <Field label="Custom model id" htmlFor="model-custom">
                    <Input
                      id="model-custom"
                      autoFocus
                      value={settings.llm_model}
                      onChange={(e) => set("llm_model", e.target.value)}
                      placeholder={provider?.models[0] ?? "model-name"}
                    />
                  </Field>
                )}
              </>
            )}

            {provider?.local && (
              <Field label="Base URL" htmlFor="baseurl" hint="Where your local server is running">
                <Input id="baseurl" value={settings.llm_base_url} onChange={(e) => set("llm_base_url", e.target.value)} />
              </Field>
            )}

            {settings.llm_provider === "openai" && (
              <Field label="OpenAI API key" htmlFor="openai">
                <Input id="openai" type="password" value={settings.openai_api_key ?? ""} onChange={(e) => set("openai_api_key", e.target.value)} placeholder="sk-…" />
              </Field>
            )}
            {settings.llm_provider === "anthropic" && (
              <Field label="Anthropic API key" htmlFor="anthropic">
                <Input id="anthropic" type="password" value={settings.anthropic_api_key ?? ""} onChange={(e) => set("anthropic_api_key", e.target.value)} placeholder="sk-ant-…" />
              </Field>
            )}
            {settings.llm_provider === "gemini" && (
              <GeminiKeys
                config={{
                  keys: settings.gemini_api_keys ?? [],
                  active_id: settings.gemini_active_key_id ?? "",
                  mode: settings.key_switch_mode ?? "auto",
                }}
                onChange={applyGemini}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Embeddings & research</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Embedding model" htmlFor="embed" hint="Local sentence-transformers model">
              <Input id="embed" value={settings.embedding_model} onChange={(e) => set("embedding_model", e.target.value)} />
            </Field>
            <Field label="Tavily API key" htmlFor="tavily" hint="Company research — the only external call (company name only)">
              <Input id="tavily" type="password" value={settings.tavily_api_key ?? ""} onChange={(e) => set("tavily_api_key", e.target.value)} placeholder="tvly-…" />
            </Field>
            <Field label="GitHub token" htmlFor="ghtoken" hint="Optional — import repos from your account">
              <Input id="ghtoken" type="password" value={settings.github_token ?? ""} onChange={(e) => set("github_token", e.target.value)} placeholder="github_pat_…" />
            </Field>
            <label className="flex items-center justify-between gap-4 rounded-[10px] border border-border bg-surface-2 px-4 py-3">
              <span className="text-[14px] text-text">
                OCR for scanned documents
                <span className="block text-[12.5px] text-text-3">Requires Tesseract installed locally</span>
              </span>
              <Switch checked={settings.ocr_enabled ?? false} onCheckedChange={(v) => set("ocr_enabled", v)} />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Company search</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field
              label="Autocomplete source"
              htmlFor="cosearch"
              hint="Predicts companies as you type on the Research page, with logos."
            >
              <Select
                id="cosearch"
                value={settings.company_search_provider ?? "wikidata"}
                onChange={(e) => set("company_search_provider", e.target.value as "wikidata" | "brandfetch")}
              >
                <option value="wikidata">Wikidata · free, no key (default)</option>
                <option value="brandfetch">Brandfetch · sharper results, needs a free client id</option>
              </Select>
            </Field>

            {settings.company_search_provider === "brandfetch" && (
              <>
                <Field
                  label="Brandfetch client id"
                  htmlFor="bfid"
                  hint="A free, public client id (not a secret key). Leave blank to try keyless mode."
                >
                  <Input
                    id="bfid"
                    value={settings.brandfetch_client_id ?? ""}
                    onChange={(e) => set("brandfetch_client_id", e.target.value)}
                    placeholder="1id…"
                  />
                </Field>
                <Alert tone="info" title="How to get it (free, no credit card)">
                  Create a free account at brandfetch.com/developers, open the dashboard, and copy your
                  Brand Search / Logo Link <strong>client id</strong>. It's a public token — safe to store here.
                </Alert>
              </>
            )}
          </CardContent>
        </Card>

        {/* Privacy & transparency — Responsible AI, in plain language */}
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="flex items-center gap-2">
                <ShieldCheck size={17} className="text-accent-ink" /> Privacy &amp; transparency
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-[13px] leading-relaxed text-text-2">
              Cover Letter Local follows Microsoft's Responsible AI principles: private by default,
              transparent about the one thing that leaves your machine, and always under your review.
            </p>
            <ul className="grid gap-3.5">
              {[
                {
                  icon: HardDrive,
                  title: "On your device by default",
                  body: "Your CV, profile, letters, embeddings, and database live only on this machine (local SQLite + vectors). Nothing is uploaded.",
                },
                {
                  icon: Globe2,
                  title: "One external call",
                  body: "Company research sends only the company name to your search provider — never your CV, profile, or letters.",
                },
                {
                  icon: Cpu,
                  title: "Cloud models are opt-in",
                  body: "Foundry Local and Ollama keep everything on-device. Choosing OpenAI, Claude, or Gemini sends prompts to that provider — your explicit choice, shown above.",
                },
                {
                  icon: Eye,
                  title: "You stay in control",
                  body: "AI output is a draft, not a decision. Every letter is yours to read, edit, and approve before you use it.",
                },
              ].map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-surface-2 text-accent-ink">
                    <Icon size={15} />
                  </span>
                  <div className="min-w-0 text-[13px] leading-snug text-text-2">
                    <p className="font-semibold text-text">{title}</p>
                    <p className="mt-0.5">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Danger zone */}
        <div className="rounded-[var(--radius-card)] border border-danger/30 bg-danger-soft/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] bg-danger-soft text-danger">
                <Trash2 size={18} />
              </span>
              <div>
                <p className="text-[15px] font-bold text-text">Reset all profile data</p>
                <p className="mt-0.5 max-w-md text-[13px] text-text-2">
                  Permanently delete your profile, skills, GitHub repos, letters, applications, and learned voice.
                  Your settings are kept. This cannot be undone.
                </p>
              </div>
            </div>
            <Button variant="danger" onClick={() => setResetOpen(true)}>
              <Trash2 size={16} /> Reset everything
            </Button>
          </div>
        </div>
      </div>
        )}
      </AsyncBoundary>

      <ResetDataDialog open={resetOpen} onOpenChange={setResetOpen} />
    </>
  );
}
