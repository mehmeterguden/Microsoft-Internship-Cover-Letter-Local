import { cn } from "@/lib/utils";

/**
 * Renders text that arrives token by token, with a blinking caret while the
 * stream is live. Whitespace is preserved so paragraph breaks show as written.
 */
export function StreamingText({
  text,
  streaming = false,
  className,
}: {
  text: string;
  streaming?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "whitespace-pre-wrap font-sans text-[15px] leading-[1.75] text-text",
        className,
      )}
    >
      {text}
      {streaming && (
        <span
          aria-hidden
          className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.15em] bg-accent"
          style={{ animation: "cll-caret 1s step-end infinite" }}
        />
      )}
    </div>
  );
}
