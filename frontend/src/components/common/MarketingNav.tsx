import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

const LINKS = [
  { to: "/onboarding", label: "Import CV" },
  { to: "/write", label: "Cover letter" },
  { to: "/research", label: "Company research" },
  { to: "/voice", label: "Writing voice" },
];

/** Top marketing navigation for the landing page. */
export function MarketingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/85 backdrop-blur-lg">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-6">
        <Link to="/" className="focus-visible:outline-none">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="rounded-[10px] px-3 py-2 text-[14px] font-medium text-text-2 transition-colors hover:bg-surface-2 hover:text-text"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Link
            to="/onboarding"
            className="inline-flex items-center gap-2 rounded-[12px] bg-accent px-5 py-2.5 text-[14px] font-semibold text-on-accent shadow-soft transition-all hover:brightness-[1.06]"
          >
            Open the app <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </header>
  );
}
