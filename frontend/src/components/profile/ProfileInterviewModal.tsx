import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Spinner } from "@/components/ui/feedback";
import {
  Sparkles,
  ArrowRight,
  SkipForward,
  CheckCircle2,
  Star,
  HelpCircle,
  Code2,
  Briefcase,
  Wrench,
  Flame,
  Layers,
  CheckSquare,
  Square,
  ArrowRightLeft,
} from "lucide-react";
import {
  generateBatchQuestions,
  previewSynthesis,
  applySynthesis,
  type InterviewQuestion,
  type AnswerItem,
  type FocusArea,
  type SynthesisDiffItem,
} from "@/api/interview";
import { toast } from "@/store/toast";

interface ProfileInterviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProfileUpdated?: () => void;
}

type ModalStep = "setup" | "interview" | "preview" | "done";

export function ProfileInterviewModal({ isOpen, onClose, onProfileUpdated }: ProfileInterviewModalProps) {
  // Wizard Step State
  const [step, setStep] = useState<ModalStep>("setup");

  // Setup Parameters
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [focusArea, setFocusArea] = useState<FocusArea>("all");

  // Interview Questions & Answers
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [collectedAnswers, setCollectedAnswers] = useState<AnswerItem[]>([]);

  // Current Question Inputs
  const [boolValue, setBoolValue] = useState<boolean | null>(null);
  const [singleValue, setSingleValue] = useState<string>("");
  const [multiValues, setMultiValues] = useState<string[]>([]);
  const [customValue, setCustomValue] = useState<string>("");
  const [ratingValue, setRatingValue] = useState<number | null>(null);
  const [textValue, setTextValue] = useState<string>("");

  // Synthesis Diff Preview
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [diffItems, setDiffItems] = useState<SynthesisDiffItem[]>([]);

  // Application Status
  const [isApplying, setIsApplying] = useState(false);
  const [appliedCount, setAppliedCount] = useState<number>(0);

  const resetAll = () => {
    setStep("setup");
    setQuestionCount(5);
    setFocusArea("all");
    setQuestions([]);
    setCurrentIndex(0);
    setCollectedAnswers([]);
    setDiffItems([]);
    setAppliedCount(0);
    clearCurrentInput();
  };

  const clearCurrentInput = () => {
    setBoolValue(null);
    setSingleValue("");
    setMultiValues([]);
    setCustomValue("");
    setRatingValue(null);
    setTextValue("");
  };

  // Step 1 -> Start Interview Batch
  const handleStartInterview = async () => {
    setLoadingBatch(true);
    try {
      const batch = await generateBatchQuestions(questionCount, focusArea);
      if (!batch || batch.length === 0) {
        toast.danger("Could not generate interview questions. Please try again.");
        return;
      }
      setQuestions(batch);
      setCurrentIndex(0);
      setCollectedAnswers([]);
      clearCurrentInput();
      setStep("interview");
    } catch (err) {
      toast.danger("Failed to load interview setup. Please try again.");
    } finally {
      setLoadingBatch(false);
    }
  };

  const currentQuestion = questions[currentIndex] || null;

  const getCurrentFormattedAnswer = (): unknown | null => {
    if (!currentQuestion) return null;
    switch (currentQuestion.type) {
      case "boolean":
        return boolValue;
      case "single_choice":
        return singleValue === "other" ? customValue.trim() : singleValue;
      case "multi_select": {
        const selected = [...multiValues];
        if (customValue.trim()) {
          selected.push(customValue.trim());
        }
        return selected.length > 0 ? selected : null;
      }
      case "rating":
        return ratingValue;
      case "text":
        return textValue.trim() || null;
      default:
        return null;
    }
  };

  // Step 2 -> Next Question or Finish Early
  const handleNextQuestion = async () => {
    if (!currentQuestion) return;
    const ans = getCurrentFormattedAnswer();

    if (ans === null || ans === "") {
      toast.danger("Please provide an answer or click Skip Question.");
      return;
    }

    const answerItem: AnswerItem = {
      question_id: currentQuestion.id,
      target_type: currentQuestion.target_type,
      target_id: currentQuestion.target_id,
      target_name: currentQuestion.target_name,
      question: currentQuestion.question,
      answer: ans,
    };

    const newAnswers = [...collectedAnswers, answerItem];
    setCollectedAnswers(newAnswers);

    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((prev) => prev + 1);
      clearCurrentInput();
    } else {
      await generateSynthesisPreview(newAnswers);
    }
  };

  const handleSkipQuestion = async () => {
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((prev) => prev + 1);
      clearCurrentInput();
    } else {
      await generateSynthesisPreview(collectedAnswers);
    }
  };

  // Finish Early & Generate Diff Preview
  const handleFinishEarly = async () => {
    let finalAnswers = [...collectedAnswers];
    const currentAns = getCurrentFormattedAnswer();
    if (currentQuestion && currentAns !== null && currentAns !== "") {
      finalAnswers.push({
        question_id: currentQuestion.id,
        target_type: currentQuestion.target_type,
        target_id: currentQuestion.target_id,
        target_name: currentQuestion.target_name,
        question: currentQuestion.question,
        answer: currentAns,
      });
    }

    if (finalAnswers.length === 0) {
      toast.danger("No questions answered yet.");
      return;
    }

    await generateSynthesisPreview(finalAnswers);
  };

  // Step 3 -> Generate Before/After Diff Preview
  const generateSynthesisPreview = async (answers: AnswerItem[]) => {
    setIsGeneratingPreview(true);
    setStep("preview");
    try {
      const diffs = await previewSynthesis(answers);
      setDiffItems(diffs);
    } catch (err) {
      toast.danger("Failed to generate preview diffs.");
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  const toggleDiffApproval = (id: string) => {
    setDiffItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, approved: !item.approved } : item))
    );
  };

  const toggleAllDiffs = (approve: boolean) => {
    setDiffItems((prev) => prev.map((item) => ({ ...item, approved: approve })));
  };

  // Step 4 -> Apply Approved Diffs to DB
  const handleApplySynthesis = async () => {
    const approved = diffItems.filter((d) => d.approved);
    if (approved.length === 0) {
      toast.danger("Please select at least one update proposal to apply.");
      return;
    }

    setIsApplying(true);
    try {
      const res = await applySynthesis(approved, {
        count: questions.length,
        focus: focusArea,
        questions,
        answers: collectedAnswers,
      });
      setAppliedCount(res.updated_count);
      setStep("done");
      toast.success("Profile successfully enriched!");
      if (onProfileUpdated) {
        onProfileUpdated();
      }
    } catch (err) {
      toast.danger("Failed to apply profile updates.");
    } finally {
      setIsApplying(false);
    }
  };

  const toggleMultiSelect = (option: string) => {
    setMultiValues((prev) =>
      prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option]
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        resetAll();
        onClose();
      }
    }}>
      <DialogContent className="max-w-2xl w-full bg-slate-900 border border-slate-800 text-slate-100 p-6 rounded-2xl shadow-2xl overflow-y-auto max-h-[85vh]">
        <DialogTitle className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-xl font-semibold text-white">
            <Sparkles className="w-5 h-5 text-indigo-400 animate-pulse" />
            AI Profile Interview & Context Generator
          </div>
          {step === "interview" && (
            <span className="text-xs font-medium text-indigo-300 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20">
              {currentIndex + 1} / {questions.length} Questions
            </span>
          )}
        </DialogTitle>

        {/* STEP 1: SETUP QUESTIONNAIRE */}
        {step === "setup" && (
          <div className="space-y-6 pt-2">
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-white">Customize Your Interview Session</h3>
              <p className="text-xs text-slate-400">
                Choose how many questions to answer and select a focus area to extract deep technical context for your profile.
              </p>
            </div>

            {/* Question Count Option */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300">How many questions would you like to answer?</label>
              <div className="grid grid-cols-3 gap-3">
                {[3, 5, 10].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setQuestionCount(num)}
                    className={`py-3 px-4 rounded-xl border text-sm font-semibold transition-all flex flex-col items-center gap-1 ${
                      questionCount === num
                        ? "bg-indigo-600/25 border-indigo-500 text-indigo-200 shadow-lg shadow-indigo-500/10"
                        : "bg-slate-800/40 border-slate-700/60 text-slate-400 hover:bg-slate-800"
                    }`}
                  >
                    <span className="text-lg">{num} Questions</span>
                    <span className="text-[10px] text-slate-500 font-normal">
                      {num === 3 ? "~2 min quick check" : num === 5 ? "~4 min standard" : "~8 min deep dive"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Focus Area Option */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300">Select Focus Area for Questions</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  { id: "all", label: "All / Mixed Profile", desc: "Balanced check across projects & skills", icon: Layers },
                  { id: "projects", label: "Projects & Architecture", desc: "System design, stacks, scaling", icon: Code2 },
                  { id: "experiences", label: "Career & Experience", desc: "Team impact, leadership, scope", icon: Briefcase },
                  { id: "skills", label: "Technical Skills", desc: "Tool mastery & production depth", icon: Wrench },
                  { id: "challenges", label: "Obstacles & Challenges", desc: "Debugging, trade-offs, learnings", icon: Flame },
                ].map((item) => {
                  const Icon = item.icon;
                  const selected = focusArea === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setFocusArea(item.id as FocusArea)}
                      className={`text-left p-3 rounded-xl border transition-all flex items-start gap-3 ${
                        selected
                          ? "bg-indigo-600/20 border-indigo-500 text-white"
                          : "bg-slate-800/30 border-slate-700/50 text-slate-300 hover:bg-slate-800/60"
                      }`}
                    >
                      <div className={`p-2 rounded-lg ${selected ? "bg-indigo-500 text-white" : "bg-slate-800 text-slate-400"}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-white">{item.label}</div>
                        <div className="text-[11px] text-slate-400 leading-tight mt-0.5">{item.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <Button
                onClick={handleStartInterview}
                disabled={loadingBatch}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 rounded-xl flex items-center justify-center gap-2"
              >
                {loadingBatch ? (
                  <>
                    <Spinner className="w-4 h-4 text-white" />
                    Generating Questions...
                  </>
                ) : (
                  <>
                    Start AI Profile Interview
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: INTERVIEW Q&A */}
        {step === "interview" && currentQuestion && (
          <div className="space-y-5 pt-2">
            {/* Target indicator & Finish early header */}
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5 font-medium text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20">
                Target: {currentQuestion.target_name || currentQuestion.target_type}
              </span>
              {collectedAnswers.length > 0 && (
                <Button
                  variant="ghost"
                  onClick={handleFinishEarly}
                  className="text-xs text-indigo-300 hover:text-white"
                >
                  Finish & Review Early ({collectedAnswers.length} answered)
                </Button>
              )}
            </div>

            {/* Question title */}
            <div className="space-y-1">
              <h4 className="text-lg font-medium text-white leading-snug">
                {currentQuestion.question}
              </h4>
              {currentQuestion.hint && (
                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
                  {currentQuestion.hint}
                </p>
              )}
            </div>

            {/* Render Question Inputs */}
            <div className="py-2 space-y-3">
              {currentQuestion.type === "boolean" && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setBoolValue(true)}
                    className={`py-3 px-4 rounded-xl border text-sm font-medium transition-all ${
                      boolValue === true
                        ? "bg-indigo-600/20 border-indigo-500 text-indigo-200"
                        : "bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    Yes (True)
                  </button>
                  <button
                    type="button"
                    onClick={() => setBoolValue(false)}
                    className={`py-3 px-4 rounded-xl border text-sm font-medium transition-all ${
                      boolValue === false
                        ? "bg-indigo-600/20 border-indigo-500 text-indigo-200"
                        : "bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    No (False)
                  </button>
                </div>
              )}

              {currentQuestion.type === "single_choice" && (
                <div className="space-y-2">
                  {(currentQuestion.options || []).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        setSingleValue(opt);
                        setCustomValue("");
                      }}
                      className={`w-full text-left py-2.5 px-3.5 rounded-xl border text-sm transition-all ${
                        singleValue === opt
                          ? "bg-indigo-600/20 border-indigo-500 text-indigo-200 font-medium"
                          : "bg-slate-800/30 border-slate-700/50 text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                  {currentQuestion.allow_custom && (
                    <div className="pt-1">
                      <input
                        type="text"
                        placeholder="Other / Custom answer..."
                        value={customValue}
                        onChange={(e) => {
                          setCustomValue(e.target.value);
                          setSingleValue("other");
                        }}
                        className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  )}
                </div>
              )}

              {currentQuestion.type === "multi_select" && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {(currentQuestion.options || []).map((opt) => {
                      const selected = multiValues.includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => toggleMultiSelect(opt)}
                          className={`py-1.5 px-3 rounded-lg border text-xs font-medium transition-all ${
                            selected
                              ? "bg-indigo-600/30 border-indigo-500 text-indigo-200"
                              : "bg-slate-800/50 border-slate-700/60 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {selected ? "✓ " : ""}{opt}
                        </button>
                      );
                    })}
                  </div>
                  {currentQuestion.allow_custom && (
                    <div className="pt-1">
                      <input
                        type="text"
                        placeholder="Option not listed? Add custom option..."
                        value={customValue}
                        onChange={(e) => setCustomValue(e.target.value)}
                        className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  )}
                </div>
              )}

              {currentQuestion.type === "rating" && (
                <div className="flex justify-between items-center gap-2 py-2">
                  {[1, 2, 3, 4, 5].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setRatingValue(val)}
                      className={`flex-1 py-3 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                        ratingValue === val
                          ? "bg-indigo-600/30 border-indigo-500 text-indigo-200 font-bold"
                          : "bg-slate-800/30 border-slate-700/50 text-slate-400 hover:bg-slate-800"
                      }`}
                    >
                      <Star className={`w-4 h-4 ${ratingValue && ratingValue >= val ? "text-amber-400 fill-amber-400" : "text-slate-600"}`} />
                      <span className="text-xs">{val}</span>
                    </button>
                  ))}
                </div>
              )}

              {currentQuestion.type === "text" && (
                <Textarea
                  placeholder="Enter detailed response..."
                  value={textValue}
                  onChange={(e) => setTextValue(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:border-indigo-500"
                />
              )}
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between border-t border-slate-800 pt-4 mt-4">
              <Button
                variant="ghost"
                onClick={handleSkipQuestion}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
              >
                <SkipForward className="w-3.5 h-3.5" />
                Skip Question
              </Button>

              <Button
                onClick={handleNextQuestion}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-4 py-2 rounded-xl flex items-center gap-1.5"
              >
                {currentIndex + 1 < questions.length ? "Next Question" : "Review Updates"}
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: BEFORE & AFTER DIFF PREVIEW */}
        {step === "preview" && (
          <div className="space-y-5 pt-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-indigo-400" />
                  Review Proposed Profile Enrichments
                </h3>
                <p className="text-xs text-slate-400">
                  Select which enriched narratives to apply to your profile database.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => toggleAllDiffs(true)}
                  className="text-[11px] text-indigo-300 hover:underline"
                >
                  Select All
                </button>
                <span className="text-slate-600">|</span>
                <button
                  type="button"
                  onClick={() => toggleAllDiffs(false)}
                  className="text-[11px] text-slate-400 hover:underline"
                >
                  Deselect All
                </button>
              </div>
            </div>

            {isGeneratingPreview ? (
              <div className="py-12 text-center space-y-3">
                <Spinner className="w-8 h-8 mx-auto text-indigo-400" />
                <p className="text-slate-400 text-xs">Synthesizing answers into Before/After proposals...</p>
              </div>
            ) : diffItems.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">
                No updates were synthesized from the responses provided.
              </div>
            ) : (
              <div className="space-y-4">
                {diffItems.map((item) => (
                  <div
                    key={item.id}
                    className={`p-4 rounded-xl border transition-all ${
                      item.approved
                        ? "bg-slate-800/50 border-indigo-500/40"
                        : "bg-slate-900 border-slate-800 opacity-60"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleDiffApproval(item.id)}
                          className="text-indigo-400 hover:text-indigo-300"
                        >
                          {item.approved ? (
                            <CheckSquare className="w-5 h-5 text-indigo-400" />
                          ) : (
                            <Square className="w-5 h-5 text-slate-500" />
                          )}
                        </button>
                        <span className="font-medium text-sm text-white">{item.target_name}</span>
                        <span className="text-[10px] text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 uppercase font-mono">
                          {item.target_type}
                        </span>
                      </div>
                    </div>

                    {/* Diff comparison view */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      {/* Current text */}
                      <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 space-y-1">
                        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                          Current Description
                        </div>
                        <div className="text-slate-400 leading-relaxed font-mono">
                          {item.current_text || "(Empty)"}
                        </div>
                      </div>

                      {/* Proposed text */}
                      <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-lg p-3 space-y-1">
                        <div className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
                          Proposed Enriched Description
                        </div>
                        <div className="text-emerald-100 leading-relaxed font-mono">
                          {item.proposed_text}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep("setup")} className="text-xs text-slate-400">
                Cancel / Restart
              </Button>

              <Button
                onClick={handleApplySynthesis}
                disabled={isApplying || diffItems.filter((d) => d.approved).length === 0}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs px-5 py-2.5 rounded-xl flex items-center gap-2"
              >
                {isApplying ? (
                  <>
                    <Spinner className="w-3.5 h-3.5 text-white" />
                    Applying Updates...
                  </>
                ) : (
                  <>
                    Confirm & Apply {diffItems.filter((d) => d.approved).length} Updates
                    <CheckCircle2 className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* STEP 4: DONE */}
        {step === "done" && (
          <div className="py-8 text-center space-y-4">
            <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-bold text-white">Profile Successfully Enriched!</h3>
            <p className="text-slate-400 max-w-md mx-auto text-sm">
              Your profile has been updated with rich technical narrative context and logged into the interview database.
            </p>
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-3 text-xs text-indigo-300 font-medium inline-block">
              {appliedCount} profile items updated and logged in database.
            </div>
            <div className="pt-4">
              <Button
                onClick={() => {
                  resetAll();
                  onClose();
                }}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 rounded-xl"
              >
                Complete & Return to Profile
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
