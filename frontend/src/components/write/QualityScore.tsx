import { Gauge, RefreshCw, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScoreRing } from "@/components/common/ScoreRing";
import { cn } from "@/lib/utils";
import type { LetterEvaluation } from "./letterTools";

function barColor(score: number): string {
  return score >= 75 ? "var(--good)" : score >= 50 ? "var(--gold)" : "var(--danger)";
}

/**
 * [2] Quality score card — runs the letter through the evaluator and shows the
 * overall score ring, a per-dimension breakdown, and the model's rationale.
 * Handles empty, loading, and result states.
 */
export function QualityScore({
  evaluation,
  loading,
  disabled,
  onEvaluate,
}: {
  evaluation: LetterEvaluation | null;
  loading: boolean;
  disabled: boolean;
  onEvaluate: () => void;
}) {
  return (
    <Card className="cll-fade">
      <CardContent className="grid gap-4 pt-5">
        <div className="flex items-center gap-2">
          <Gauge size={15} className="text-accent-ink" />
          <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-text-2">
            Quality
          </span>
          {evaluation && !loading && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7 px-2"
              onClick={onEvaluate}
              disabled={disabled}
            >
              <RefreshCw size={13} /> Re-score
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-4">
            <div className="h-[70px] w-[70px] shrink-0 animate-pulse rounded-full bg-surface-2" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-3/4 animate-pulse rounded bg-surface-2" />
              <div className="h-3 w-full animate-pulse rounded bg-surface-2" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-surface-2" />
            </div>
          </div>
        ) : !evaluation ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-[13px] leading-relaxed text-text-2">
              Score this draft for relevance, specificity, structure, and tone — with a short rationale.
            </p>
            <Button size="sm" variant="secondary" onClick={onEvaluate} disabled={disabled}>
              <Sparkles size={14} /> Score this letter
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="flex items-center gap-4">
              <ScoreRing value={evaluation.score} size={70} label="Quality score" />
              <p className="text-[13px] leading-relaxed text-text-2">{evaluation.rationale}</p>
            </div>
            <div className="grid gap-2.5">
              {evaluation.breakdown.map((b) => (
                <div key={b.label} className="grid gap-1">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-medium text-text-2">{b.label}</span>
                    <span className="font-mono font-semibold text-text">{b.score}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={cn("h-full rounded-full transition-[width] duration-500")}
                      style={{ width: `${b.score}%`, background: barColor(b.score) }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
