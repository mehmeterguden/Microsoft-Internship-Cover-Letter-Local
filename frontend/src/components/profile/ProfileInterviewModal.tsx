import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Spinner } from "@/components/ui/feedback";
import { Sparkles, ArrowRight, SkipForward, CheckCircle2, Star, HelpCircle } from "lucide-react";
import {
  getNextInterviewQuestion,
  synthesizeInterviewAnswers,
  type InterviewQuestion,
  type QuestionHistoryItem,
  type AnswerItem,
} from "@/api/interview";
import { toast } from "@/store/toast";

interface ProfileInterviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProfileUpdated?: () => void;
}

export function ProfileInterviewModal({ isOpen, onClose, onProfileUpdated }: ProfileInterviewModalProps) {
  const [loadingQuestion, setLoadingQuestion] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<InterviewQuestion | null>(null);
  const [history, setHistory] = useState<QuestionHistoryItem[]>([]);
  const [collectedAnswers, setCollectedAnswers] = useState<AnswerItem[]>([]);

  // Current question answer state
  const [boolValue, setBoolValue] = useState<boolean | null>(null);
  const [singleValue, setSingleValue] = useState<string>("");
  const [multiValues, setMultiValues] = useState<string[]>([]);
  const [customValue, setCustomValue] = useState<string>("");
  const [ratingValue, setRatingValue] = useState<number | null>(null);
  const [textValue, setTextValue] = useState<string>("");

  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthesisDone, setSynthesisDone] = useState(false);
  const [updateStats, setUpdateStats] = useState<{ updated_count: number } | null>(null);

  // Fetch first question on open
  useEffect(() => {
    if (isOpen) {
      resetState();
      fetchNextQuestion([]);
    }
  }, [isOpen]);

  const resetState = () => {
    setHistory([]);
    setCollectedAnswers([]);
    setCurrentQuestion(null);
    setSynthesisDone(false);
    setUpdateStats(null);
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

  const fetchNextQuestion = async (hist: QuestionHistoryItem[]) => {
    setLoadingQuestion(true);
    clearCurrentInput();
    try {
      const q = await getNextInterviewQuestion(hist);
      setCurrentQuestion(q);
    } catch (err) {
      toast.danger("Failed to load question. Please try again.");
    } finally {
      setLoadingQuestion(false);
    }
  };

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

  const handleNext = async () => {
    if (!currentQuestion) return;
    const ans = getCurrentFormattedAnswer();

    if (ans === null || ans === "") {
      toast.danger("Please provide an answer or click Skip Question.");
      return;
    }

    const historyItem: QuestionHistoryItem = {
      id: currentQuestion.id,
      question: currentQuestion.question,
      answer: ans,
    };

    const answerItem: AnswerItem = {
      question_id: currentQuestion.id,
      target_type: currentQuestion.target_type,
      target_id: currentQuestion.target_id,
      question: currentQuestion.question,
      answer: ans,
    };

    const newHistory = [...history, historyItem];
    const newAnswers = [...collectedAnswers, answerItem];

    setHistory(newHistory);
    setCollectedAnswers(newAnswers);

    await fetchNextQuestion(newHistory);
  };

  const handleSkip = async () => {
    if (!currentQuestion) return;

    const historyItem: QuestionHistoryItem = {
      id: currentQuestion.id,
      question: currentQuestion.question,
      answer: "(Skipped)",
    };

    const newHistory = [...history, historyItem];
    setHistory(newHistory);

    await fetchNextQuestion(newHistory);
  };

  const handleFinishAndSynthesize = async () => {
    // If there is an unsaved answer in the current question, include it
    let finalAnswers = [...collectedAnswers];
    const currentAns = getCurrentFormattedAnswer();
    if (currentQuestion && currentAns !== null && currentAns !== "") {
      finalAnswers.push({
        question_id: currentQuestion.id,
        target_type: currentQuestion.target_type,
        target_id: currentQuestion.target_id,
        question: currentQuestion.question,
        answer: currentAns,
      });
    }

    if (finalAnswers.length === 0) {
      toast.danger("No questions answered yet.");
      return;
    }

    setIsSynthesizing(true);
    try {
      const res = await synthesizeInterviewAnswers(finalAnswers);
      setUpdateStats({ updated_count: res.updated_count });
      setSynthesisDone(true);
      toast.success("Profile successfully enriched!");
      if (onProfileUpdated) {
        onProfileUpdated();
      }
    } catch (err) {
      toast.danger("Failed to process answers.");
    } finally {
      setIsSynthesizing(false);
    }
  };

  const toggleMultiSelect = (option: string) => {
    setMultiValues((prev) =>
      prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option]
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl w-full bg-slate-900 border border-slate-800 text-slate-100 p-6 rounded-2xl shadow-2xl">
        <DialogTitle className="flex items-center gap-2 text-xl font-semibold text-white border-b border-slate-800 pb-3">
          <Sparkles className="w-5 h-5 text-indigo-400 animate-pulse" />
          AI Profile Interview & Context Generator
        </DialogTitle>

        {synthesisDone ? (
          <div className="py-8 text-center space-y-4">
            <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-bold text-white">Interview Completed!</h3>
            <p className="text-slate-400 max-w-md mx-auto text-sm">
              Your {collectedAnswers.length} responses have been analyzed, enriching your projects, experiences, and skills with rich technical narrative context.
            </p>
            {updateStats && (
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-3 text-xs text-indigo-300 font-medium inline-block">
                {updateStats.updated_count} profile items updated and enriched.
              </div>
            )}
            <div className="pt-4">
              <Button onClick={onClose} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 rounded-xl">
                Complete & Return to Profile
              </Button>
            </div>
          </div>
        ) : isSynthesizing ? (
          <div className="py-12 text-center space-y-4">
            <Spinner className="w-10 h-10 mx-auto text-indigo-400" />
            <h3 className="text-lg font-semibold text-white">Processing Answers...</h3>
            <p className="text-slate-400 text-xs max-w-sm mx-auto">
              AI is analyzing your interview responses to synthesize deep technical narrative context for your profile items.
            </p>
          </div>
        ) : loadingQuestion ? (
          <div className="py-12 text-center space-y-3">
            <Spinner className="w-8 h-8 mx-auto text-indigo-400" />
            <p className="text-slate-400 text-xs">Generating customized question for your profile...</p>
          </div>
        ) : currentQuestion ? (
          <div className="space-y-5 pt-2">
            {/* Target indicator */}
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5 font-medium text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20">
                Target: {currentQuestion.target_name || currentQuestion.target_type}
              </span>
              <span>Question #{history.length + 1} ({collectedAnswers.length} answered)</span>
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

            {/* Render Question Inputs based on Question Type */}
            <div className="py-2 space-y-3">
              {/* Type 1: Boolean */}
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

              {/* Type 2: Single Choice */}
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

              {/* Type 3: Multi Select */}
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
                    <div className="pt-1 flex gap-2">
                      <input
                        type="text"
                        placeholder="Option not listed? Add custom option..."
                        value={customValue}
                        onChange={(e) => setCustomValue(e.target.value)}
                        className="flex-1 bg-slate-800/60 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Type 4: Rating (1-5) */}
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

              {/* Type 5: Open Text */}
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
                onClick={handleSkip}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
              >
                <SkipForward className="w-3.5 h-3.5" />
                Skip Question
              </Button>

              <div className="flex items-center gap-2">
                {collectedAnswers.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={handleFinishAndSynthesize}
                    className="text-xs border-slate-700 hover:bg-slate-800 text-indigo-300"
                  >
                    Finish & Enrich ({collectedAnswers.length})
                  </Button>
                )}

                <Button
                  onClick={handleNext}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-4 py-2 rounded-xl flex items-center gap-1.5"
                >
                  Next Question
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
