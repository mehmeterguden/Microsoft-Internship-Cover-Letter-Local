// TEMPORARY: Developer Feedback System (TO BE REMOVED BEFORE PRODUCTION)

import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import html2canvas from "html2canvas";
import { Check, Info, Loader2, Minimize2, MousePointer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { toast } from "@/store/toast";
import {
  useDevFeedbackStore,
  type DevFeedbackCategory,
} from "@/store/devFeedback";

interface TargetInfo {
  element: HTMLElement;
  tagName: string;
  selector: string;
  rect: { x: number; y: number; width: number; height: number };
  textSnippet: string;
  buttonLabel?: string;
  selectedText?: string;
  locationContext?: string;
  elementHierarchy?: string;
}

const detectButtonLabel = (el: HTMLElement): string => {
  const interactive = el.closest("button, a, input, select, textarea, [role='button']") as HTMLElement | null;
  if (!interactive) return "";
  const label =
    interactive.getAttribute("aria-label") ||
    interactive.title ||
    (interactive as HTMLInputElement).value ||
    interactive.innerText?.replace(/\s+/g, " ").trim() ||
    "";
  return label.slice(0, 100);
};

const detectLocationContext = (el: HTMLElement): string => {
  if (el.closest("aside, nav, [class*='sidebar']")) return "Left Navigation Sidebar";
  if (el.closest("header, [class*='header'], [class*='navbar']")) return "Top Navigation Header";
  if (el.closest("[class*='dialog'], [role='dialog'], .fixed.inset-0")) return "Modal Dialog Window";
  if (el.closest("[class*='sidebar-right']") || el.closest("section")) {
    const parentText = el.closest("section")?.querySelector("h1, h2, h3, h4")?.textContent?.trim();
    if (parentText) return `Right Panel (${parentText})`;
  }
  if (el.closest("textarea, [class*='editor']")) return "Main Cover Letter Editor";
  
  const rect = el.getBoundingClientRect();
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  const hPos = rect.left < winW / 3 ? "Left" : rect.left > (winW * 2) / 3 ? "Right" : "Center";
  const vPos = rect.top < winH / 3 ? "Top" : rect.top > (winH * 2) / 3 ? "Bottom" : "Middle";
  return `Workspace (${vPos}-${hPos})`;
};

const buildHierarchyPath = (el: HTMLElement): string => {
  const parts: string[] = [];
  let current: HTMLElement | null = el;
  while (current && current !== document.body && parts.length < 4) {
    let tag = current.tagName.toLowerCase();
    const role = current.getAttribute("role");
    const title = current.getAttribute("aria-label") || current.title || (current.tagName === "BUTTON" ? current.innerText?.trim() : "");
    if (title && title.length < 30) {
      tag += `["${title.replace(/"/g, "'")}"]`;
    } else if (role) {
      tag += `[role=${role}]`;
    }
    parts.unshift(tag);
    current = current.parentElement;
  }
  return parts.join(" > ");
};

const buildSelector = (el: HTMLElement): string => {
  if (el.id) return `#${el.id}`;
  const parts: string[] = [];
  let current: HTMLElement | null = el;

  while (current && current !== document.body && parts.length < 3) {
    let name = current.tagName.toLowerCase();
    if (current.className && typeof current.className === "string") {
      const classes = current.className
        .split(" ")
        .filter((c) => c && !c.startsWith("cll-") && !c.includes("hover:"))
        .slice(0, 2);
      if (classes.length > 0) {
        name += `.${classes.join(".")}`;
      }
    }
    parts.unshift(name);
    current = current.parentElement;
  }

  return parts.join(" > ") || el.tagName.toLowerCase();
};

export function DevFeedbackInspector() {
  const location = useLocation();
  const { inspectorActive, toggleInspector, addFeedback } = useDevFeedbackStore();

  const [hoveredRect, setHoveredRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
    tagName: string;
    selector: string;
  } | null>(null);

  const [selectedTarget, setSelectedTarget] = useState<TargetInfo | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState<string | undefined>(undefined);
  const [capturing, setCapturing] = useState(false);

  const [category, setCategory] = useState<DevFeedbackCategory>("ui_layout");
  const [notes, setNotes] = useState("");
  const [minimized, setMinimized] = useState(false);

  // Track mouse movement to highlight elements under cursor
  useEffect(() => {
    if (!inspectorActive || modalOpen) {
      setHoveredRect(null);
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || target.closest("[data-dev-inspector]")) {
        setHoveredRect(null);
        return;
      }

      const rect = target.getBoundingClientRect();
      setHoveredRect({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        tagName: target.tagName.toLowerCase(),
        selector: buildSelector(target),
      });
    };

    const handleClick = async (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || target.closest("[data-dev-inspector]")) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const rect = target.getBoundingClientRect();
      const selectionText = window.getSelection()?.toString().trim() || "";
      const buttonText = detectButtonLabel(target);
      const locationCtx = detectLocationContext(target);
      const hierarchyPath = buildHierarchyPath(target);

      const targetData: TargetInfo = {
        element: target,
        tagName: target.tagName.toLowerCase(),
        selector: buildSelector(target),
        rect: {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        },
        textSnippet: target.innerText?.replace(/\s+/g, " ").trim() || "",
        buttonLabel: buttonText || undefined,
        selectedText: selectionText || undefined,
        locationContext: locationCtx,
        elementHierarchy: hierarchyPath,
      };

      setSelectedTarget(targetData);
      setModalOpen(true);
      setCapturing(true);

      try {
        // Capture element screenshot via html2canvas
        const canvas = await html2canvas(target, {
          logging: false,
          useCORS: true,
          scale: 1.5,
          backgroundColor: null,
        });
        setScreenshotUrl(canvas.toDataURL("image/png"));
      } catch (err) {
        console.warn("Screenshot capture failed, continuing without image", err);
        setScreenshotUrl(undefined);
      } finally {
        setCapturing(false);
      }
    };

    window.addEventListener("mousemove", handleMouseMove, true);
    window.addEventListener("click", handleClick, true);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove, true);
      window.removeEventListener("click", handleClick, true);
    };
  }, [inspectorActive, modalOpen]);

  const handleSubmit = () => {
    if (!selectedTarget) return;
    if (!notes.trim()) {
      toast.warning("Enter requested edit instructions");
      return;
    }

    addFeedback({
      route: location.pathname,
      tagName: selectedTarget.tagName,
      selector: selectedTarget.selector,
      rect: selectedTarget.rect,
      textSnippet: selectedTarget.textSnippet,
      buttonLabel: selectedTarget.buttonLabel,
      selectedText: selectedTarget.selectedText,
      locationContext: selectedTarget.locationContext,
      elementHierarchy: selectedTarget.elementHierarchy,
      category,
      notes: notes.trim(),
      screenshotUrl,
    });

    toast.success("Feedback collected!", "View and export to AI in Settings -> Developer Feedback.");
    setModalOpen(false);
    setSelectedTarget(null);
    setNotes("");
    setScreenshotUrl(undefined);
  };

  const handleClose = () => {
    setModalOpen(false);
    setSelectedTarget(null);
    setNotes("");
    setScreenshotUrl(undefined);
    toggleInspector(false);
  };

  return (
    <div data-dev-inspector className="pointer-events-none">
      {/* Active Inspector Mode Banner */}
      {inspectorActive && !modalOpen && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-auto flex items-center gap-3 bg-indigo-600 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-2xl border border-indigo-400/50 animate-bounce">
          <MousePointer size={14} className="animate-pulse" />
          <span>Click any element on screen to record feedback</span>
          <button
            type="button"
            onClick={() => toggleInspector(false)}
            className="ml-2 hover:bg-white/20 p-1 rounded-full transition"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Hover Bounding Box */}
      {inspectorActive && hoveredRect && !modalOpen && (
        <div
          className="fixed pointer-events-none z-40 border-2 border-indigo-500 bg-indigo-500/10 rounded-sm transition-all duration-75"
          style={{
            left: hoveredRect.x,
            top: hoveredRect.y,
            width: hoveredRect.width,
            height: hoveredRect.height,
          }}
        >
          <span className="absolute -top-6 left-0 bg-indigo-600 text-white text-[10px] font-mono px-2 py-0.5 rounded shadow-md whitespace-nowrap">
            &lt;{hoveredRect.tagName}&gt; {hoveredRect.selector} ({Math.round(hoveredRect.width)}x{Math.round(hoveredRect.height)}px)
          </span>
        </div>
      )}

      {/* Non-Blocking Bottom-Right Floating Panel */}
      {modalOpen && selectedTarget && (
        <div className="fixed bottom-6 right-6 z-50 pointer-events-auto flex flex-col w-[420px] max-w-[calc(100vw-3rem)] max-h-[85vh] overflow-hidden rounded-[20px] border border-border/80 bg-surface/95 backdrop-blur-md shadow-2xl animate-in slide-in-from-bottom-5 slide-in-from-right-5 duration-200">
          {/* Panel Header */}
          <div className="flex items-center justify-between border-b border-border/80 px-4 py-3 bg-surface-2/40">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400">
                <MousePointer size={14} />
              </span>
              <div>
                <h2 className="text-[13.5px] font-bold text-fg leading-tight">Developer Feedback</h2>
                <p className="text-[10.5px] text-fg-mid font-mono">
                  {location.pathname} · &lt;{selectedTarget.tagName}&gt;
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMinimized((m) => !m)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-fg-low hover:bg-surface-2 hover:text-fg transition cursor-pointer"
                title={minimized ? "Expand panel" : "Minimize panel"}
              >
                <Minimize2 size={14} />
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="flex h-7 w-7 items-center justify-center rounded-md text-fg-low hover:bg-surface-2 hover:text-fg transition cursor-pointer"
                title="Close panel"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {!minimized && (
            <>
              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Target info card */}
                <div className="rounded-xl border border-border bg-surface-2/50 p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-fg-mid font-mono text-[11px]">
                    <span>Selector: <strong className="text-fg font-semibold">{selectedTarget.selector}</strong></span>
                    <span>{Math.round(selectedTarget.rect.width)}x{Math.round(selectedTarget.rect.height)}px</span>
                  </div>

                  {selectedTarget.locationContext && (
                    <div className="text-[11px] text-indigo-300 font-semibold flex items-center gap-1.5 bg-indigo-500/10 px-2 py-1 rounded border border-indigo-500/20">
                      <span>📌 Location:</span>
                      <span className="font-mono text-fg">{selectedTarget.locationContext}</span>
                    </div>
                  )}

                  {selectedTarget.buttonLabel && (
                    <div className="text-[11px] text-amber-300 font-semibold flex items-center gap-1.5 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20">
                      <span>🔘 Action Label:</span>
                      <span className="font-mono text-fg font-bold">"{selectedTarget.buttonLabel}"</span>
                    </div>
                  )}

                  {selectedTarget.selectedText && (
                    <div className="text-[11px] text-emerald-300 font-semibold flex items-start gap-1.5 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
                      <span>✂️ Selection:</span>
                      <span className="font-mono text-fg line-clamp-2">"{selectedTarget.selectedText}"</span>
                    </div>
                  )}

                  {selectedTarget.elementHierarchy && (
                    <div className="text-[10px] text-fg-mid font-mono truncate">
                      <span>Path: {selectedTarget.elementHierarchy}</span>
                    </div>
                  )}

                  {screenshotUrl ? (
                    <div className="mt-2 overflow-hidden rounded-lg border border-border bg-black/40 flex justify-center max-h-[110px] p-1.5">
                      <img src={screenshotUrl} alt="Captured element" className="object-contain max-h-[95px] rounded" />
                    </div>
                  ) : capturing ? (
                    <div className="py-3 flex items-center justify-center gap-2 text-fg-mid text-[11px]">
                      <Loader2 size={13} className="animate-spin text-indigo-400" />
                      <span>Capturing element screenshot…</span>
                    </div>
                  ) : null}
                </div>

                {/* Feedback Category */}
                <div className="space-y-1.5">
                  <label className="text-[11.5px] font-medium text-fg">Feedback Category</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: "ui_layout", label: "UI / Layout" },
                      { id: "bug_fix", label: "Bug Fix" },
                      { id: "copy_text", label: "Copy / Text" },
                      { id: "feature_request", label: "Feature" },
                      { id: "other", label: "Other" },
                    ].map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCategory(c.id as DevFeedbackCategory)}
                        className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer ${
                          category === c.id
                            ? "bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-sm"
                            : "bg-surface-2/40 border-border/60 text-fg-mid hover:bg-surface-2"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notes / Edit Instructions */}
                <div className="space-y-1.5">
                  <label className="text-[11.5px] font-medium text-fg">Requested Edit Instructions</label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Describe exact changes (e.g. 'Make button wider', 'Change font size', 'Fix alignment')..."
                    className="min-h-[80px] text-xs"
                    autoFocus
                  />
                </div>

                <div className="flex items-center gap-1.5 text-[10.5px] text-fg-low bg-surface-2/60 p-2 rounded-lg border border-border/60">
                  <Info size={12} className="shrink-0 text-indigo-400" />
                  <span>Rest of screen remains 100% active while inspecting.</span>
                </div>
              </div>

              {/* Panel Footer */}
              <div className="flex items-center justify-between border-t border-border/80 bg-surface-2/30 px-4 py-2.5">
                <Button type="button" variant="outline" size="sm" onClick={handleClose} className="text-xs h-8">
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="solid"
                  size="sm"
                  onClick={handleSubmit}
                  className="text-xs h-8 px-3.5 bg-indigo-600 hover:bg-indigo-500 text-white"
                >
                  <Check size={13} className="mr-1.5" />
                  Submit Feedback
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
