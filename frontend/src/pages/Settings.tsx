import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Database,
  Eye,
  EyeOff,
  Plus,
  RotateCw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { Page } from "@/components/common/Page";
import { AsyncBoundary } from "@/components/common/AsyncBoundary";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Segmented, Toggle } from "@/components/ui/controls";
import { Pill, Spinner } from "@/components/ui/feedback";
import { useAsync } from "@/lib/useAsync";
import { cn } from "@/lib/utils";
import { toast } from "@/store/toast";
import { errorMessage } from "@/api/client";
import {
  addGeminiKey,
  getGeminiKeys,
  getSettings,
  removeGeminiKey,
  saveSettings,
  setGeminiActiveKey,
  setKeySwitchMode,
} from "@/api/settings";
import { listModels, type ModelsResult } from "@/api/llm";
import { resetAllData } from "@/api/data";
import type {
  CompanySearchProvider,
  GeminiKey,
  GeminiKeyConfig,
  KeySwitchMode,
  LLMProviderId,
  PiiShieldMode,
  ResearchCacheRetention,
  Settings as SettingsModel,
} from "@/api/types";

/* ── Static config ───────────────────────────────────────────────
   The provider grid drives `llm_provider`. Base URLs here are only
   sensible defaults applied when a provider is picked — the field
   stays editable and its real value lives in settings. `curatedModels`
   is the fallback list shown when live discovery fails. */
type Tab = "model" | "integrations" | "data";

type ProviderMeta = {
  id: LLMProviderId;
  name: string;
  desc: string;
  badge: string;
  cloud: boolean;
  baseUrl: string;
  curatedModels: string[];
};

const PROVIDERS: ProviderMeta[] = [
  {
    id: "foundry_local",
    name: "Foundry Local",
    desc: "Microsoft's on-device runtime. Private by default.",
    badge: "Default",
    cloud: false,
    baseUrl: "http://localhost:5272/v1",
    curatedModels: ["phi-4", "phi-3.5-mini", "qwen2.5-7b", "mistral-7b", "llama-3.2-3b"],
  },
  {
    id: "azure_openai",
    name: "Azure OpenAI",
    desc: "Microsoft-managed cloud models via your Azure resource.",
    badge: "Cloud",
    cloud: true,
    baseUrl: "",
    curatedModels: [],
  },
  {
    id: "ollama",
    name: "Ollama",
    desc: "Run open models locally with a single command.",
    badge: "Local",
    cloud: false,
    baseUrl: "http://localhost:11434",
    curatedModels: ["llama3.1:8b", "mistral:7b", "qwen2.5:14b", "gemma2:9b", "phi3.5"],
  },
  {
    id: "lm_studio",
    name: "LM Studio",
    desc: "Local model server with a friendly desktop UI.",
    badge: "Local",
    cloud: false,
    baseUrl: "http://localhost:1234/v1",
    curatedModels: ["llama-3.1-8b-instruct", "mistral-nemo", "qwen2.5-coder", "gemma-2-9b", "phi-3.5"],
  },
  {
    id: "openai",
    name: "OpenAI",
    desc: "GPT-4o and o-series models via your API key.",
    badge: "Cloud",
    cloud: true,
    baseUrl: "https://api.openai.com/v1",
    curatedModels: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "o3-mini", "o1"],
  },
  {
    id: "anthropic",
    name: "Claude",
    desc: "Anthropic's Claude models via your API key.",
    badge: "Cloud",
    cloud: true,
    baseUrl: "https://api.anthropic.com",
    curatedModels: ["claude-opus-4", "claude-sonnet-4", "claude-3.5-sonnet", "claude-3.5-haiku", "claude-3-opus"],
  },
  {
    id: "gemini",
    name: "Gemini",
    desc: "Google's Gemini with automatic key-pool rotation.",
    badge: "Cloud",
    cloud: true,
    baseUrl: "https://generativelanguage.googleapis.com",
    curatedModels: ["gemini-2.0-flash", "gemini-2.0-pro", "gemini-1.5-pro", "gemini-1.5-flash", "gemini-1.5-flash-8b"],
  },
];

const EMBED_MODELS = ["all-MiniLM-L6-v2", "nomic-embed-text", "mxbai-embed-large", "bge-small-en-v1.5"];

const NAV: { value: Tab; label: string }[] = [
  { value: "model", label: "Model & inference" },
  { value: "integrations", label: "Integrations" },
  { value: "data", label: "Data" },
];

const RETENTION_OPTIONS: { value: ResearchCacheRetention; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "7_days", label: "7 days" },
  { value: "30_days", label: "30 days" },
  { value: "forever", label: "Forever" },
  { value: "last_10", label: "Last 10" },
];

const PII_SHIELD_OPTIONS: { value: PiiShieldMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "risky_only", label: "High-risk only" },
  { value: "on", label: "Always" },
];

/** Fields persisted by the main Save button (the Gemini pool persists on its own). */
const MAIN_FIELDS: (keyof SettingsModel)[] = [
  "llm_provider",
  "llm_base_url",
  "llm_model",
  "openai_api_key",
  "anthropic_api_key",
  "embedding_model",
  "tavily_api_key",
  "github_token",
  "company_search_provider",
  "brandfetch_client_id",
  "ocr_enabled",
  "research_cache_retention",
  "pii_shield",
  "rag_rerank",
];

const norm = (v: unknown): unknown => (v === undefined || v === null ? "" : v);

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 10) return "•".repeat(key.length);
  return `${key.slice(0, 4)}${"•".repeat(Math.min(18, key.length - 8))}${key.slice(-4)}`;
}

/* ── Page (load boundary) ────────────────────────────────────────── */
export function Settings() {
  const state = useAsync(getSettings, []);
  if (state.data) return <SettingsForm initial={state.data} />;
  return (
    <Page eyebrow="Setup / Settings" title="Settings" bodyClassName="px-7 py-5">
      <AsyncBoundary state={state}>{() => null}</AsyncBoundary>
    </Page>
  );
}

/* ── The editable form (mounted once settings have loaded) ─────────── */
function SettingsForm({ initial }: { initial: SettingsModel }) {
  const [tab, setTab] = useState<Tab>("model");
  const [draft, setDraft] = useState<SettingsModel>(initial);
  const [saved, setSaved] = useState<SettingsModel>(initial);
  const [saving, setSaving] = useState(false);
  const [reveal, setReveal] = useState(false);

  const provider = PROVIDERS.find((p) => p.id === draft.llm_provider) ?? PROVIDERS[0];

  /* Model discovery — re-runs on provider change / committed base-URL change.
     `listModels` reports provider errors in `result.error`, network faults land
     in the async `error`; we surface both. Base URL is committed on blur / Test
     so typing doesn't fire a request per keystroke. */
  const [discoBaseUrl, setDiscoBaseUrl] = useState(initial.llm_base_url);
  const discovery = useAsync<ModelsResult>(
    () => listModels(draft.llm_provider, discoBaseUrl || undefined),
    [draft.llm_provider, discoBaseUrl],
  );
  const discoveredModels = discovery.data?.models ?? [];
  const discoveryError = discovery.error ?? discovery.data?.error ?? null;
  const modelOptions =
    draft.llm_model && !discoveredModels.includes(draft.llm_model)
      ? [draft.llm_model, ...discoveredModels]
      : discoveredModels;

  // Auto-select the first discovered model when none is set yet (e.g. after a switch).
  useEffect(() => {
    if (!draft.llm_model && discoveredModels.length > 0) {
      setDraft((d) => (d.llm_model ? d : { ...d, llm_model: discoveredModels[0] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discovery.data]);

  /* Gemini key pool — its own source of truth, each mutation persists immediately. */
  const [pool, setPool] = useState<GeminiKeyConfig | null>(null);
  const [poolLoading, setPoolLoading] = useState(true);
  const [poolError, setPoolError] = useState<string | null>(null);
  const loadPool = useCallback(async () => {
    setPoolLoading(true);
    setPoolError(null);
    try {
      setPool(await getGeminiKeys());
    } catch (e) {
      setPoolError(errorMessage(e));
    } finally {
      setPoolLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadPool();
  }, [loadPool]);

  const [removeTarget, setRemoveTarget] = useState<GeminiKey | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState("");
  const [resetting, setResetting] = useState(false);

  const dirty = useMemo(() => MAIN_FIELDS.some((k) => norm(draft[k]) !== norm(saved[k])), [draft, saved]);

  const setField = <K extends keyof SettingsModel>(key: K, value: SettingsModel[K]) =>
    setDraft((d) => ({ ...d, [key]: value }) as SettingsModel);

  const selectProvider = (p: ProviderMeta) => {
    setDraft((d) => ({ ...d, llm_provider: p.id, llm_base_url: p.baseUrl, llm_model: "" }));
    setDiscoBaseUrl(p.baseUrl);
  };

  const testConnection = () => {
    if (discoBaseUrl !== draft.llm_base_url) setDiscoBaseUrl(draft.llm_base_url);
    else discovery.reload();
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload: SettingsModel = {
        ...saved,
        ...draft,
        // keep the Gemini pool authoritative from its own endpoints, never clobber it
        ...(pool
          ? { gemini_api_keys: pool.keys, gemini_active_key_id: pool.active_id, key_switch_mode: pool.mode }
          : {}),
      };
      const result = await saveSettings(payload);
      setSaved(result);
      setDraft(result);
      toast.success("Settings saved");
    } catch (e) {
      toast.danger("Couldn't save settings", errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setDraft(saved);
    setDiscoBaseUrl(saved.llm_base_url);
  };

  // ── Gemini pool actions (persist immediately + toast) ──
  const addKey = async (key: string, label: string): Promise<boolean> => {
    try {
      setPool(await addGeminiKey(key, label));
      toast.success("Key added", "Rotates automatically on rate limits.");
      return true;
    } catch (e) {
      toast.danger("Couldn't add key", errorMessage(e));
      return false;
    }
  };
  const activateKey = async (id: string) => {
    try {
      setPool(await setGeminiActiveKey(id));
      toast.success("Active key updated");
    } catch (e) {
      toast.danger("Couldn't switch key", errorMessage(e));
    }
  };
  const changeMode = async (mode: KeySwitchMode) => {
    try {
      setPool(await setKeySwitchMode(mode));
      toast.success(mode === "auto" ? "Auto-rotation enabled" : "Manual mode enabled");
    } catch (e) {
      toast.danger("Couldn't update mode", errorMessage(e));
    }
  };
  const confirmRemoveKey = async () => {
    if (!removeTarget) return;
    try {
      setPool(await removeGeminiKey(removeTarget.id));
      toast.success("Key removed");
    } catch (e) {
      toast.danger("Couldn't remove key", errorMessage(e));
    } finally {
      setRemoveTarget(null);
    }
  };

  const doReset = async () => {
    if (resetText.trim().toUpperCase() !== "DELETE") return;
    setResetting(true);
    try {
      const res = await resetAllData();
      toast.success("All data reset", `Removed ${res.total} record${res.total === 1 ? "" : "s"}. Settings kept.`);
      setResetOpen(false);
      setResetText("");
    } catch (e) {
      toast.danger("Reset failed", errorMessage(e));
    } finally {
      setResetting(false);
    }
  };

  const companyProvider: CompanySearchProvider = draft.company_search_provider ?? "wikidata";
  const retention: ResearchCacheRetention = draft.research_cache_retention ?? "30_days";
  const piiShield: PiiShieldMode = draft.pii_shield ?? "risky_only";
  const embedOptions =
    draft.embedding_model && !EMBED_MODELS.includes(draft.embedding_model)
      ? [draft.embedding_model, ...EMBED_MODELS]
      : EMBED_MODELS;

  return (
    <Page
      eyebrow="Setup / Settings"
      title="Settings"
      bodyClassName="px-7 py-5"
      actions={
        <div className="flex items-center gap-2.5">
          {dirty ? (
            <Pill tone="warning" mono dot>
              Unsaved
            </Pill>
          ) : null}
          <Button variant="ghost" size="sm" onClick={discard} disabled={!dirty || saving}>
            Discard
          </Button>
          <Button variant="solid" size="sm" onClick={save} loading={saving} disabled={!dirty}>
            Save changes
          </Button>
        </div>
      }
    >
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
                    <ProviderCard
                      key={p.id}
                      provider={p}
                      active={p.id === draft.llm_provider}
                      onClick={() => selectProvider(p)}
                    />
                  ))}
                </div>
              </section>

              {/* Model + base URL */}
              <div className="grid grid-cols-2 gap-3.5">
                <Field
                  label={provider.id === "azure_openai" ? "Deployment" : "Model"}
                  hint={
                    provider.id === "azure_openai"
                      ? "Your Azure deployment name — save your endpoint & key, then Test connection to list deployments."
                      : discoveryError && !discovery.loading
                        ? "Discovery unavailable — enter a model name."
                        : undefined
                  }
                >
                  {discovery.loading ? (
                    <div className="flex h-11 items-center gap-2 rounded-[10px] border border-border-strong bg-input px-3.5 text-[13px] text-fg-mid">
                      <Spinner size={14} /> Discovering models…
                    </div>
                  ) : discoveredModels.length > 0 ? (
                    <ModelSelect value={draft.llm_model} options={modelOptions} onChange={(m) => setField("llm_model", m)} />
                  ) : (
                    <div className="flex flex-col gap-2">
                      <Input
                        value={draft.llm_model}
                        onChange={(e) => setField("llm_model", e.target.value)}
                        placeholder={provider.id === "azure_openai" ? "e.g. gpt-4o-mini (your deployment name)" : "e.g. llama3.1:8b"}
                        spellCheck={false}
                        className="h-11 font-mono text-[13px]"
                      />
                      {provider.curatedModels.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {provider.curatedModels.map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setField("llm_model", m)}
                              className="rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-[10.5px] text-fg-mid transition-colors hover:border-accent hover:text-accent-text"
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}
                </Field>
                {provider.id === "azure_openai" ? (
                  <Field label="Azure endpoint" hint="The resource root, e.g. https://my-resource.openai.azure.com">
                    <Input
                      value={draft.azure_openai_endpoint ?? ""}
                      onChange={(e) => setField("azure_openai_endpoint", e.target.value)}
                      placeholder="https://my-resource.openai.azure.com"
                      spellCheck={false}
                      className="h-11 font-mono text-[13px]"
                    />
                  </Field>
                ) : (
                  <Field label="Base URL">
                    <Input
                      value={draft.llm_base_url}
                      onChange={(e) => setField("llm_base_url", e.target.value)}
                      onBlur={() => setDiscoBaseUrl(draft.llm_base_url)}
                      spellCheck={false}
                      className="h-11 font-mono text-[13px]"
                    />
                  </Field>
                )}
              </div>

              {provider.id === "azure_openai" ? (
                <Field label="API version" hint="The Azure OpenAI REST API version. Leave the default unless your resource needs another.">
                  <Input
                    value={draft.azure_openai_api_version ?? ""}
                    onChange={(e) => setField("azure_openai_api_version", e.target.value)}
                    placeholder="2024-10-21"
                    spellCheck={false}
                    className="h-11 max-w-[240px] font-mono text-[13px]"
                  />
                </Field>
              ) : null}

              {/* Connection status */}
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="outline" size="sm" onClick={testConnection} disabled={discovery.loading}>
                    <RotateCw size={14} className={discovery.loading ? "animate-spin" : undefined} /> Test connection
                  </Button>
                  <ConnectionStatus loading={discovery.loading} error={discoveryError} count={discoveredModels.length} />
                  {!provider.cloud ? (
                    <span className="text-[11px] text-fg-low">
                      {discovery.loading ? "…" : `${discoveredModels.length} local models discovered`}
                    </span>
                  ) : (
                    <span className="text-[11px] text-fg-low">Using your API key</span>
                  )}
                </div>
                {discoveryError && !discovery.loading ? (
                  <p className="text-[12px] leading-relaxed text-danger">{discoveryError}</p>
                ) : null}
              </div>

              {/* Cloud credentials — single key for OpenAI/Claude, rotating pool for Gemini */}
              {provider.cloud ? (
                provider.id === "gemini" ? (
                  <section>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-[14px] font-semibold text-fg">Gemini keys</span>
                      <div className="flex items-center gap-2.5">
                        <RevealButton revealed={reveal} onClick={() => setReveal((r) => !r)} />
                        <PillToggle
                          value={pool?.mode ?? "auto"}
                          onChange={changeMode}
                          options={[
                            { value: "auto", label: "Auto" },
                            { value: "manual", label: "Manual" },
                          ]}
                        />
                      </div>
                    </div>
                    <p className="mb-3 text-[12px] text-fg-mid">
                      Add several keys — auto mode rotates to the next on rate limits.
                    </p>
                    {poolLoading ? (
                      <div className="flex items-center gap-2 rounded-[10px] border border-border bg-surface px-3.5 py-3 text-[12px] text-fg-mid">
                        <Spinner size={14} /> Loading keys…
                      </div>
                    ) : poolError ? (
                      <div className="flex items-center justify-between gap-3 rounded-[10px] border border-[color:var(--danger)]/30 bg-danger-weak px-3.5 py-3 text-[12px] text-danger">
                        <span>{poolError}</span>
                        <Button variant="outline" size="xs" onClick={() => void loadPool()}>
                          <RotateCw size={12} /> Retry
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {pool && pool.keys.length > 0 ? (
                          pool.keys.map((k) => (
                            <GeminiKeyRow
                              key={k.id}
                              entry={k}
                              active={k.id === pool.active_id}
                              value={reveal ? k.key : maskKey(k.key)}
                              onSetActive={() => void activateKey(k.id)}
                              onRemove={() => setRemoveTarget(k)}
                            />
                          ))
                        ) : (
                          <p className="rounded-[10px] border border-dashed border-border-strong px-3.5 py-3 text-[12px] text-fg-low">
                            No keys yet. Add one below to enable Gemini.
                          </p>
                        )}
                        <AddGeminiKey onAdd={addKey} />
                      </div>
                    )}
                  </section>
                ) : (
                  <section>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-[14px] font-semibold text-fg">{provider.name} API key</span>
                      <RevealButton revealed={reveal} onClick={() => setReveal((r) => !r)} />
                    </div>
                    <p className="mb-3 text-[12px] text-fg-mid">
                      Stored locally in your settings. Used only while {provider.name} is the active provider.
                    </p>
                    <Input
                      type={reveal ? "text" : "password"}
                      value={
                        (provider.id === "openai"
                          ? draft.openai_api_key
                          : provider.id === "azure_openai"
                            ? draft.azure_openai_api_key
                            : draft.anthropic_api_key) ?? ""
                      }
                      onChange={(e) =>
                        setField(
                          provider.id === "openai"
                            ? "openai_api_key"
                            : provider.id === "azure_openai"
                              ? "azure_openai_api_key"
                              : "anthropic_api_key",
                          e.target.value,
                        )
                      }
                      placeholder={provider.id === "openai" ? "sk-…" : provider.id === "azure_openai" ? "Your Azure resource key" : "sk-ant-…"}
                      autoComplete="off"
                      spellCheck={false}
                      className="font-mono text-[12px]"
                    />
                  </section>
                )
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
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-[14px] font-semibold text-fg">Integrations</h2>
                <RevealButton revealed={reveal} onClick={() => setReveal((r) => !r)} />
              </div>
              <div className="flex flex-col gap-2.5">
                <Row>
                  <span className="text-[13px] text-fg">Embedding model</span>
                  <EmbeddingSelect
                    value={draft.embedding_model}
                    options={embedOptions}
                    onChange={(v) => setField("embedding_model", v)}
                  />
                </Row>

                <Row>
                  <span className="text-[13px] text-fg">Autocomplete source</span>
                  <PillToggle
                    value={companyProvider}
                    onChange={(v) => setField("company_search_provider", v)}
                    options={[
                      { value: "wikidata", label: "Wikidata" },
                      { value: "brandfetch", label: "Brandfetch" },
                    ]}
                  />
                </Row>

                <Row>
                  <span className="text-[13px] text-fg">
                    Brandfetch client id{" "}
                    {companyProvider !== "brandfetch" ? (
                      <span className="text-[11px] text-fg-low">· inactive</span>
                    ) : null}
                  </span>
                  <Input
                    type={reveal ? "text" : "password"}
                    value={draft.brandfetch_client_id ?? ""}
                    onChange={(e) => setField("brandfetch_client_id", e.target.value)}
                    placeholder="id_…"
                    autoComplete="off"
                    spellCheck={false}
                    className="h-9 w-[240px] font-mono text-[11px]"
                  />
                </Row>

                <Row>
                  <span className="text-[13px] text-fg">
                    Tavily key <span className="text-[11px] text-fg-low">· research</span>
                  </span>
                  <Input
                    type={reveal ? "text" : "password"}
                    value={draft.tavily_api_key ?? ""}
                    onChange={(e) => setField("tavily_api_key", e.target.value)}
                    placeholder="tvly-…"
                    autoComplete="off"
                    spellCheck={false}
                    className="h-9 w-[240px] font-mono text-[11px]"
                  />
                </Row>

                <Row>
                  <span className="text-[13px] text-fg">GitHub token</span>
                  <span className="flex items-center gap-2.5">
                    {draft.github_token ? (
                      <Pill tone="success" dot>
                        set
                      </Pill>
                    ) : null}
                    <Input
                      type={reveal ? "text" : "password"}
                      value={draft.github_token ?? ""}
                      onChange={(e) => setField("github_token", e.target.value)}
                      placeholder="ghp_…"
                      autoComplete="off"
                      spellCheck={false}
                      className="h-9 w-[240px] font-mono text-[11px]"
                    />
                  </span>
                </Row>

                <Row>
                  <span className="text-[13px] text-fg">OCR for scanned CVs</span>
                  <Toggle
                    checked={draft.ocr_enabled ?? false}
                    onChange={(v) => setField("ocr_enabled", v)}
                    aria-label="OCR for scanned CVs"
                  />
                </Row>

                <Row>
                  <span className="min-w-0 pr-3 text-[13px] text-fg">
                    Rerank retrieved writing samples
                    <span className="mt-0.5 block text-[11.5px] leading-snug text-fg-low">
                      Higher-precision voice matching with a cross-encoder. Downloads a small model on first use.
                    </span>
                  </span>
                  <Toggle
                    checked={draft.rag_rerank ?? false}
                    onChange={(v) => setField("rag_rerank", v)}
                    aria-label="Rerank retrieved writing samples"
                  />
                </Row>
              </div>

              {/* Research cache retention (new control) */}
              <div className="mt-5 rounded-[12px] border border-border bg-surface p-4">
                <Field
                  label="Research cache retention"
                  hint="How long company-research reports are kept on this device before they're cleared."
                >
                  <Segmented
                    options={RETENTION_OPTIONS}
                    value={retention}
                    onChange={(v) => setField("research_cache_retention", v)}
                  />
                </Field>
              </div>

              {/* PII shield */}
              <div className="mt-5 rounded-[12px] border border-border bg-surface p-4">
                <Field
                  label="Personal-data shield"
                  hint="After a letter is generated, scan it (locally) for personal or sensitive data and warn you. High-risk only flags things like card / bank / SSN numbers; Always also flags emails, phones and IPs."
                >
                  <Segmented
                    options={PII_SHIELD_OPTIONS}
                    value={piiShield}
                    onChange={(v) => setField("pii_shield", v)}
                  />
                </Field>
              </div>
            </div>
          ) : null}

          {tab === "data" ? (
            <div key="data" className="cll-fade flex flex-col gap-4">
              <div className="rounded-[12px] border border-border bg-surface p-[18px]">
                <div className="mb-2.5 flex items-center gap-2 text-[10.5px] font-semibold tracking-[0.01em] text-fg-low">
                  <Database size={13} /> Stored on this device
                </div>
                <p className="text-[12.5px] leading-relaxed text-fg-mid">
                  Your profile, skills, cover letters, embeddings, and cached company research all live in a local database
                  and vector store on this machine. Nothing here is uploaded.
                </p>
              </div>

              <div
                className="rounded-[12px] border p-4"
                style={{ background: "rgba(251,113,133,.06)", borderColor: "rgba(251,113,133,.25)" }}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[13px] font-semibold text-danger">Reset all data</div>
                    <div className="mt-[3px] text-[12px] text-fg-mid">
                      Deletes your profile, letters, and cache. Settings are kept. This can't be undone.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setResetOpen(true)}
                    className="flex shrink-0 items-center gap-2 rounded-[9px] border bg-transparent px-4 py-2 text-[12.5px] font-semibold text-danger transition-colors hover:bg-danger-weak"
                    style={{ borderColor: "var(--danger)" }}
                  >
                    <Trash2 size={14} /> Reset…
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Remove-key confirmation */}
      <ConfirmDialog
        open={removeTarget != null}
        onOpenChange={(o) => {
          if (!o) setRemoveTarget(null);
        }}
        tone="danger"
        icon={<X size={22} />}
        title="Remove this key?"
        description={
          removeTarget
            ? `${maskKey(removeTarget.key)}${removeTarget.label ? ` · ${removeTarget.label}` : ""} will be removed from the rotation.`
            : undefined
        }
        confirmLabel="Remove key"
        onConfirm={() => void confirmRemoveKey()}
      />

      {/* Reset confirmation (type-to-confirm) */}
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={(o) => {
          setResetOpen(o);
          if (!o) setResetText("");
        }}
        tone="danger"
        icon={<AlertTriangle size={22} />}
        title="Reset all data?"
        description="This permanently deletes your profile, skills, cover letters, and the research cache from this device. Your settings are kept. This can't be undone."
        confirmLabel="Delete everything"
        loading={resetting}
        onConfirm={() => void doReset()}
      >
        <Field label="Type DELETE to confirm">
          <Input
            value={resetText}
            onChange={(e) => setResetText(e.target.value)}
            placeholder="DELETE"
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <p className={cn("mt-2 text-[11px]", resetText.trim().toUpperCase() === "DELETE" ? "text-success" : "text-fg-low")}>
          {resetText.trim().toUpperCase() === "DELETE"
            ? "Confirmed — this will erase everything."
            : "Type DELETE exactly to enable the button."}
        </p>
      </ConfirmDialog>
    </Page>
  );
}

/* ── Left-nav tab ────────────────────────────────────────────────── */
function NavTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
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
function ProviderCard({ provider, active, onClick }: { provider: ProviderMeta; active: boolean; onClick: () => void }) {
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
        className="flex h-11 w-full items-center justify-between rounded-[10px] border border-border-strong bg-input px-3.5 text-[13px] text-fg transition-colors hover:border-accent"
      >
        {value || <span className="text-fg-low">Select a model…</span>}
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
        {value || "select…"}
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

/* ── Gemini key row ──────────────────────────────────────────────── */
function GeminiKeyRow({
  entry,
  active,
  value,
  onSetActive,
  onRemove,
}: {
  entry: GeminiKey;
  active: boolean;
  value: string;
  onSetActive: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[10px] border bg-surface px-3.5 py-3",
        active ? "border-accent" : "border-border",
      )}
    >
      <button
        type="button"
        onClick={onSetActive}
        aria-label={active ? "Active key" : "Make this key active"}
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          active ? "border-accent" : "border-border-strong hover:border-accent",
        )}
      >
        {active ? <span className="h-[7px] w-[7px] rounded-full bg-accent" /> : null}
      </button>
      <div className="min-w-0 flex-1">
        <div className={cn("truncate font-mono text-[12px]", active ? "text-fg" : "text-fg-mid")}>{value}</div>
        {entry.label ? <div className="truncate text-[11px] text-fg-low">{entry.label}</div> : null}
      </div>
      <span className={cn("font-mono text-[10px]", active ? "text-success" : "text-fg-low")}>
        {active ? "Active" : "Standby"}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="p-0.5 text-fg-low transition-colors hover:text-danger"
        aria-label="Remove key"
      >
        <X size={15} strokeWidth={1.6} />
      </button>
    </div>
  );
}

/* ── Add-key inline form ─────────────────────────────────────────── */
function AddGeminiKey({ onAdd }: { onAdd: (key: string, label: string) => Promise<boolean> }) {
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!key.trim() || busy) return;
    setBusy(true);
    const ok = await onAdd(key.trim(), label.trim());
    setBusy(false);
    if (ok) {
      setKey("");
      setLabel("");
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-dashed border-border-strong p-2">
      <Input
        value={key}
        onChange={(e) => setKey(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
        }}
        placeholder="AIza… (new key)"
        autoComplete="off"
        spellCheck={false}
        className="h-9 flex-1 font-mono text-[12px]"
      />
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
        }}
        placeholder="label (optional)"
        autoComplete="off"
        spellCheck={false}
        className="h-9 w-[130px] text-[12px]"
      />
      <Button variant="outline" size="sm" onClick={() => void submit()} loading={busy} disabled={!key.trim()}>
        <Plus size={14} strokeWidth={1.8} /> Add
      </Button>
    </div>
  );
}

/* ── Reveal (eye) toggle ─────────────────────────────────────────── */
function RevealButton({ revealed, onClick }: { revealed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-[8px] border border-border-strong bg-surface px-2.5 py-1.5 text-[11px] text-fg-mid transition-colors hover:text-fg"
      aria-label={revealed ? "Hide secrets" : "Show secrets"}
    >
      {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
      {revealed ? "Hide" : "Show"}
    </button>
  );
}

/* ── Connection status pill ──────────────────────────────────────── */
function ConnectionStatus({ loading, error, count }: { loading: boolean; error: string | null; count: number }) {
  if (loading) {
    return (
      <Pill tone="accent" mono dot>
        Checking…
      </Pill>
    );
  }
  if (error) {
    return (
      <Pill tone="danger" mono dot>
        Unavailable
      </Pill>
    );
  }
  return (
    <Pill tone="success" mono dot>
      {`Healthy · ${count} models`}
    </Pill>
  );
}

/* ── Integrations row shell ──────────────────────────────────────── */
function Row({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[10px] border border-border bg-surface px-3.5 py-3">
      {children}
    </div>
  );
}
