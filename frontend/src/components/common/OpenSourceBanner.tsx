import { GithubMark, MicrosoftLogo, REPO_URL } from "./ProjectBadge";

/** Repeating "open source / Microsoft internship" banner used across pages. */
export function OpenSourceBanner() {
  return (
    <div
      className="cll-fade relative flex flex-wrap items-center gap-3 overflow-hidden rounded-[13px] border border-border-strong px-4 py-3"
      style={{ background: "linear-gradient(120deg, var(--surface-2), var(--surface))" }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-2.5 -top-10 h-32 w-44 rounded-full"
        style={{ background: "var(--glow-2)", opacity: 0.2, filter: "blur(38px)" }}
      />
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-border-strong bg-input text-fg">
        <GithubMark />
      </span>
      <div className="relative min-w-[200px] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-bold tracking-[-0.2px] text-fg">Cover Letter Local is open source</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-1.5 py-0.5">
            <MicrosoftLogo />
            <span className="text-[9px] font-semibold text-fg-mid">Microsoft internship</span>
          </span>
        </div>
        <p className="mt-1 max-w-[520px] text-[11.5px] leading-snug text-fg-mid">
          My Microsoft internship project — free &amp; open for everyone. Runs fully on-device.
        </p>
      </div>
      <div className="relative flex shrink-0 gap-2">
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-[9px] border border-accent bg-accent-weak px-3 py-2 text-[11.5px] font-semibold text-accent-text no-underline"
        >
          <svg width="13" height="13" viewBox="0 0 20 20" fill="var(--warning)" aria-hidden>
            <path d="M10 3l2 4.5 5 .5-3.8 3.3 1.2 4.9L10 13.7 5.6 16.2l1.2-4.9L3 8l5-.5z" />
          </svg>
          Star
        </a>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-[9px] border border-border-strong bg-surface px-3 py-2 text-[11.5px] font-semibold text-fg no-underline"
        >
          View source
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M7 5h8v8M15 5l-9 9" />
          </svg>
        </a>
      </div>
    </div>
  );
}
