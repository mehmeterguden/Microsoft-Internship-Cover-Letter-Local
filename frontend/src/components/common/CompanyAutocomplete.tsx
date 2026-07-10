import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { suggestCompanies, companyLogoUrl } from "@/api/companies";
import type { CompanySuggestion } from "@/api/types";
import { cn } from "@/lib/utils";

/** Initials for the monogram fallback: first letters of up to two words. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] ?? "?").slice(0, 2).toUpperCase();
}

/** Deterministic hue from the name so a company's monogram color is stable. */
function hue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

/** Company logo with a graceful chain: proxied logo → monogram (never a broken image). */
function CompanyLogo({ suggestion, size = 22 }: { suggestion: Pick<CompanySuggestion, "name" | "logo">; size?: number }) {
  const [failed, setFailed] = useState(false);
  const url = companyLogoUrl(suggestion.logo);
  const box = { width: size, height: size };
  if (!url || failed) {
    const h = hue(suggestion.name);
    return (
      <span
        className="grid shrink-0 place-items-center rounded-[6px] text-[10px] font-bold"
        style={{ ...box, color: `hsl(${h} 55% 42%)`, background: `hsl(${h} 60% 50% / 0.16)` }}
        aria-hidden
      >
        {initials(suggestion.name)}
      </span>
    );
  }
  return (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className="shrink-0 rounded-[6px] object-contain"
      style={box}
      aria-hidden
    />
  );
}

/**
 * Company-name field with live autocomplete: debounced suggestions from the
 * backend (`/api/companies/suggest`), each row showing the brand logo, name and a
 * description/domain. Keyboard- and mouse-navigable. On pick it reports the chosen
 * suggestion so callers can also use the domain/logo.
 */
export function CompanyAutocomplete({
  value,
  onChange,
  onSelect,
  id,
  placeholder = "Start typing a company…",
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (suggestion: CompanySuggestion) => void;
  id?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [items, setItems] = useState<CompanySuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const [picked, setPicked] = useState<CompanySuggestion | null>(null);

  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // When we set the input from a pick, skip the next debounced fetch.
  const skipFetch = useRef(false);

  // Debounced fetch on query change.
  useEffect(() => {
    const q = value.trim();
    if (skipFetch.current) {
      skipFetch.current = false;
      return;
    }
    if (q.length < 2) {
      setItems([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = window.setTimeout(() => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      suggestCompanies(q, ctrl.signal)
        .then((results) => {
          setItems(results);
          setActive(-1);
          setOpen(true);
        })
        .catch((err) => {
          if (err?.code !== "ERR_CANCELED") setItems([]);
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => window.clearTimeout(t);
  }, [value]);

  function choose(s: CompanySuggestion) {
    skipFetch.current = true;
    setPicked(s);
    onChange(s.name);
    onSelect?.(s);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || items.length === 0) {
      if (e.key === "ArrowDown" && items.length) setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (active >= 0) {
        e.preventDefault();
        choose(items[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showPickedLogo = picked && picked.name === value;

  return (
    <div
      ref={boxRef}
      className="relative"
      onBlur={(e) => {
        if (!boxRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      {/* Leading adornment: search icon, or the picked company's logo */}
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
        {showPickedLogo ? (
          <CompanyLogo suggestion={picked} size={20} />
        ) : (
          <Search size={16} className="text-text-3" />
        )}
      </span>

      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        autoFocus={autoFocus}
        className="pl-10"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          if (picked) setPicked(null);
          onChange(e.target.value);
        }}
        onFocus={() => items.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
      />

      {loading && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2">
          <Loader2 size={15} className="animate-spin text-text-3" />
        </span>
      )}

      {open && items.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1.5 max-h-80 w-full overflow-auto rounded-[12px] border border-border bg-surface p-1.5 shadow-elevated"
        >
          {items.map((s, i) => (
            <li key={`${s.name}-${s.domain ?? i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                // onMouseDown (not click) so it fires before the input's blur closes the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(s);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-[9px] px-2.5 py-2 text-left transition-colors",
                  i === active ? "bg-accent-soft" : "hover:bg-surface-2",
                )}
              >
                <CompanyLogo suggestion={s} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-text">{s.name}</span>
                  {(s.description || s.domain) && (
                    <span className="block truncate text-[12px] text-text-3">
                      {s.description || s.domain}
                      {s.description && s.domain ? ` · ${s.domain}` : ""}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
