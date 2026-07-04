import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  FileUp,
  AudioLines,
  PenLine,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const STEPS = [
  { icon: FileUp, title: "Import your CV", body: "Extract and structure your experience locally — no upload to the cloud.", to: "/onboarding" },
  { icon: AudioLines, title: "Learn your voice", body: "We study your past letters and build a fingerprint of how you write and think.", to: "/voice" },
  { icon: Building2, title: "Research the company", body: "Parallel agents gather a detailed, source-cited intelligence report.", to: "/research" },
  { icon: PenLine, title: "Generate the letter", body: "A grounded, personalized letter streams in — in your own voice.", to: "/write" },
];

export function Home() {
  return (
    <>
      <section className="mb-12" style={{ animation: "cll-rise 0.5s both" }}>
        <Badge tone="accent" className="mb-4">
          <ShieldCheck size={12} /> Runs entirely on your machine
        </Badge>
        <h1 className="max-w-3xl text-[clamp(34px,5vw,56px)] font-bold leading-[1.05]">
          Write cover letters that sound like <span className="text-accent-ink">you</span> — privately.
        </h1>
        <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-text-2">
          Cover Letter Local learns your writing voice, profiles your skills, researches the company,
          and generates a personalized letter. Nothing leaves your device.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button size="lg" asChild>
            <Link to="/onboarding">
              <Sparkles size={17} /> Get started
            </Link>
          </Button>
          <Button size="lg" variant="secondary" asChild>
            <Link to="/write">
              Write a letter <ArrowRight size={16} />
            </Link>
          </Button>
        </div>
      </section>

      <section>
        <p className="mb-4 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-text-3">
          How it works
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {STEPS.map(({ icon: Icon, title, body, to }, i) => (
            <Link key={title} to={to} className="group focus-visible:outline-none">
              <Card hoverable className="h-full">
                <CardContent className="flex gap-4 pt-5">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[11px] bg-accent-soft text-accent-ink">
                    <Icon size={20} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-text-3">0{i + 1}</span>
                      <h3 className="text-[15.5px] font-bold">{title}</h3>
                    </div>
                    <p className="mt-1 text-[13.5px] leading-snug text-text-2">{body}</p>
                  </div>
                  <ArrowRight
                    size={17}
                    className="ml-auto mt-1 shrink-0 text-text-3 transition-transform group-hover:translate-x-1 group-hover:text-accent-ink"
                  />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
