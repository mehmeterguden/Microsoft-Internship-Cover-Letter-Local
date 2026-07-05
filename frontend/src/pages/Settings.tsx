import { useEffect, useState } from "react";
import { Save, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { AsyncBoundary } from "@/components/common/AsyncBoundary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import type { LLMProviderId, Settings as SettingsType } from "@/api/types";
import { getSettings, saveSettings } from "@/api/settings";
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

  useEffect(() => {
    if (loaded.data) setSettings(loaded.data);
  }, [loaded.data]);

  const provider = settings ? PROVIDERS.find((p) => p.id === settings.llm_provider) : undefined;
  const isCloud = provider ? !provider.local : false;

  function set<K extends keyof SettingsType>(key: K, value: SettingsType[K]) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  // Switching provider auto-selects that provider's default model and endpoint.
  function changeProvider(id: LLMProviderId) {
    const info = PROVIDERS.find((p) => p.id === id)!;
    setSettings((prev) =>
      prev ? { ...prev, llm_provider: id, llm_model: info.models[0]!, llm_base_url: info.baseUrl } : prev,
    );
  }

  const models = provider?.models ?? [];
  const isCustomModel = settings != null && models.length > 0 && !models.includes(settings.llm_model);

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      await saveSettings(settings);
      toast.success("Settings saved", "Stored locally in your database.");
    } catch (err) {
      toast.danger("Save failed", errorMessage(err));
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

            <Field label="Model" htmlFor="model" hint={provider?.local ? "Pick a model, or choose Custom to enter one you've pulled locally." : undefined}>
              <Select
                id="model"
                value={isCustomModel ? CUSTOM : settings.llm_model}
                onChange={(e) => set("llm_model", e.target.value === CUSTOM ? "" : e.target.value)}
              >
                {models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
                <option value={CUSTOM}>Custom…</option>
              </Select>
            </Field>

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
              <Field label="Gemini API key" htmlFor="gemini">
                <Input id="gemini" type="password" value={settings.gemini_api_key ?? ""} onChange={(e) => set("gemini_api_key", e.target.value)} placeholder="AIza…" />
              </Field>
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
      </div>
        )}
      </AsyncBoundary>
    </>
  );
}
