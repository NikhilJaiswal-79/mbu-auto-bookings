"use client";

import { useState, useEffect } from "react";
import { generateQuizQuestion, QuizQuestion } from "@/lib/gemini";

interface QuizComponentProps {
    isActive?: boolean; // Controls availability based on ride status
}

export default function QuizComponent({ isActive = true }: QuizComponentProps) {
    // Preferences State
    const [language, setLanguage] = useState("");
    const [context, setContext] = useState("");
    const [difficulty, setDifficulty] = useState("");

    // Quiz State
    const [status, setStatus] = useState<"SETUP" | "PLAYING" | "RESULTS">("SETUP");
    const [currentQuestion, setCurrentQuestion] = useState<QuizQuestion | null>(null);
    const [nextQuestion, setNextQuestion] = useState<QuizQuestion | null>(null); // Buffer
    const [questionNumber, setQuestionNumber] = useState(0);
    const [loading, setLoading] = useState(false);
    const [selectedOption, setSelectedOption] = useState<number | null>(null);

    // Results State
    const [history, setHistory] = useState<{ question: QuizQuestion; selected: number }[]>([]);

    // Retry Logic
    const [retryCountdown, setRetryCountdown] = useState(0);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (currentQuestion?.question.startsWith("AI Error") && retryCountdown > 0) {
            interval = setInterval(() => {
                setRetryCountdown(prev => prev - 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [currentQuestion, retryCountdown]);

    useEffect(() => {
        if (!isActive) {
            setStatus("SETUP");
            setHistory([]);
            setCurrentQuestion(null);
            setNextQuestion(null);
        }
    }, [isActive]);

    const fetchQuestionInternal = async (): Promise<QuizQuestion | null> => {
        try {
            return await generateQuizQuestion(language, context, difficulty);
        } catch (error) {
            console.error("Failed to generte question", error);
            // Fallback Question if API fails
            return {
                question: "Which of the following is NOT a JavaScript data type?",
                options: ["String", "Boolean", "Float", "Undefined"],
                correctIndex: 2,
                explanation: "Float is not a distinct data type in JavaScript; all numbers are of type 'Number'."
            };
        }
    };

    // Initial Start: Fetch first two questions
    const handleStartQuiz = async () => {
        setQuestionNumber(0);
        setHistory([]);
        setStatus("PLAYING");
        setLoading(true);

        // Sequential Fetch for stability
        const q1 = await fetchQuestionInternal();
        if (q1) {
            setCurrentQuestion(q1);
            setQuestionNumber(1);
            setLoading(false); // Show first question immediately
        }

        // Fetch buffer in background *after* showing first
        const q2 = await fetchQuestionInternal();
        if (q2) {
            setNextQuestion(q2);
        }
    };

    const handleSubmitAnswer = () => {
        if (selectedOption === null || !currentQuestion) return;

        // Record history
        setHistory(prev => [...prev, { question: currentQuestion, selected: selectedOption }]);
        setSelectedOption(null);

        // Move to next question immediately if available
        if (nextQuestion) {
            setCurrentQuestion(nextQuestion);
            setNextQuestion(null);
            setQuestionNumber(prev => prev + 1);

            // Fetch the NEXT one in background
            fetchQuestionInternal().then(q => {
                if (q) setNextQuestion(q);
            });
        } else {
            // If buffer empty (rare), show loading
            setLoading(true);
            fetchQuestionInternal().then(q => {
                if (q) {
                    setCurrentQuestion(q);
                    setQuestionNumber(prev => prev + 1);
                }
                setLoading(false);
                // Start filling buffer again
                fetchQuestionInternal().then(nq => setNextQuestion(nq));
            }, 6000); // 6s Delay to respect Rate Limit (10req/min = 6s/req)
        }
    };

    const handleRetryQuestion = async () => {
        setLoading(true);
        const q = await fetchQuestionInternal();
        if (q) {
            setCurrentQuestion(q);
            // Pre-fetch next
            setTimeout(() => {
                fetchQuestionInternal().then(nq => setNextQuestion(nq));
            }, 6000);
        }
        setLoading(false);
    };

    const handleEndQuiz = () => {
        if (confirm("Are you sure you want to end the quiz? Your progress will be saved.")) {
            setStatus("RESULTS");
        }
    };

    const calculateScore = () => {
        return history.reduce((acc, item) => item.selected === item.question.correctIndex ? acc + 1 : acc, 0);
    };

    if (!isActive) {
        return (
            <div className="bg-gray-800/50 p-6 rounded-2xl border border-gray-700 text-center opacity-50 cursor-not-allowed">
                <h3 className="text-xl font-bold text-gray-400 mb-2">Quiz Unavailable 🔒</h3>
                <p className="text-gray-500">Quiz is only available during an active ride.</p>
            </div>
        );
    }

    if (status === "SETUP") {
        return (
            <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800 shadow-xl">
                <h3 className="text-2xl font-bold text-white mb-2">Learn While You Ride! 🧠</h3>
                <p className="text-gray-400 mb-6">Customize your quiz to start learning.</p>

                <div className="space-y-4 mb-6">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Coding Language</label>
                        <select
                            value={language}
                            onChange={(e) => setLanguage(e.target.value)}
                            className="w-full bg-gray-800 text-white p-3 rounded-xl border border-gray-700 focus:border-indigo-500 outline-none"
                        >
                            <option value="">Select Language</option>
                            {["Python", "JavaScript", "Java", "C++", "Ruby", "Go", "Swift", "Kotlin", "PHP", "TypeScript"].map(l => (
                                <option key={l} value={l}>{l}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Topic Context</label>
                        <select
                            value={context}
                            onChange={(e) => setContext(e.target.value)}
                            className="w-full bg-gray-800 text-white p-3 rounded-xl border border-gray-700 focus:border-indigo-500 outline-none"
                        >
                            <option value="">Select Context</option>
                            {["Data Structures", "Algorithms", "Syntax", "Web Development", "OOP", "Database", "Design Patterns", "Debugging", "API", "Testing"].map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Difficulty</label>
                        <select
                            value={difficulty}
                            onChange={(e) => setDifficulty(e.target.value)}
                            className="w-full bg-gray-800 text-white p-3 rounded-xl border border-gray-700 focus:border-indigo-500 outline-none"
                        >
                            <option value="">Select Difficulty</option>
                            {["Beginner", "Intermediate", "Advanced"].map(d => (
                                <option key={d} value={d}>{d}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <button
                    onClick={handleStartQuiz}
                    disabled={!language || !context || !difficulty}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all shadow-lg active:scale-95"
                >
                    Start Quiz 🚀
                </button>
            </div>
        );
    }

    if (status === "PLAYING") {
        return (
            <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800 shadow-xl relative min-h-[400px] flex flex-col">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest block">{language} • {difficulty}</span>
                        <span className="text-xs text-gray-500">Question {questionNumber}</span>
                    </div>
                    <button onClick={handleEndQuiz} className="text-red-400 hover:text-red-300 text-sm font-semibold">
                        End Quiz
                    </button>
                </div>

                {loading || !currentQuestion ? (
                    <div className="flex-1 flex flex-col justify-center items-center space-y-4">
                        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-gray-400 animate-pulse">Generating Question with AI...</p>
                    </div>
                ) : (

                    currentQuestion.question.startsWith("AI Error") ? (
                        <div className="flex-1 flex flex-col justify-center items-center text-center space-y-4 fade-in">
                            <div className="text-4xl">⏳</div>
                            <h4 className="text-xl text-yellow-500 font-bold">Limit Reached ({retryCountdown}s)</h4>
                            <p className="text-gray-400 text-sm max-w-xs break-words px-4">
                                {currentQuestion.question.replace("AI Error:", "").replace(/\[.*?\]/g, "")}
                            </p>
                            <p className="text-gray-500 text-xs text-center border p-2 rounded bg-gray-800 border-gray-700">
                                <b>Tip:</b> If you see this often, ensure your API keys are from <br /><u>different Google Projects</u>.
                            </p>
                            <button
                                onClick={handleRetryQuestion}
                                disabled={retryCountdown > 0}
                                className={`px-6 py-3 rounded-xl font-bold transition-all mt-4 w-full flex items-center justify-center gap-2
                                    ${retryCountdown > 0 ? "bg-gray-700 text-gray-500 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg active:scale-95"}
                                `}
                            >
                                {retryCountdown > 0 ? `Wait ${retryCountdown}s` : "Try Again 🔄"}
                            </button>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col fade-in">
                            <h4 className="text-xl text-white font-medium mb-8 leading-relaxed">{currentQuestion.question}</h4>

                            <div className="space-y-3 mb-8 flex-1">
                                {currentQuestion.options.map((opt, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setSelectedOption(idx)}
                                        className={`w-full text-left p-4 rounded-xl border transition-all ${selectedOption === idx
                                            ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                                            : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:border-gray-500"
                                            }`}
                                    >
                                        <span className="mr-3 font-mono opacity-50">{String.fromCharCode(65 + idx)}.</span>
                                        {opt}
                                    </button>
                                ))}
                            </div>

                            <button
                                onClick={handleSubmitAnswer}
                                disabled={selectedOption === null}
                                className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all shadow-lg active:scale-95"
                            >
                                Submit Answer ➔
                            </button>
                        </div>
                    ))}
            </div>
        );
    }

    // RESULTS STATE
    const finalScore = calculateScore();
    const wrongAnswers = history.filter(h => h.selected !== h.question.correctIndex);
    const percentage = Math.round((finalScore / history.length) * 100) || 0;

    return (
        <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800 shadow-xl max-h-[600px] overflow-y-auto custom-scrollbar">
            <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-white mb-2">Quiz Completed! 🎉</h3>
                <div className="inline-flex items-center justify-center w-24 h-24 rounded-full border-4 border-indigo-500 bg-indigo-500/10 mb-2">
                    <span className="text-2xl font-black text-indigo-400">{percentage}%</span>
                </div>
                <p className="text-gray-400">You scored <span className="text-white font-bold">{finalScore}</span> out of <span className="text-white font-bold">{history.length}</span></p>
            </div>

            {wrongAnswers.length > 0 && (
                <div className="mb-8 space-y-4">
                    <h4 className="text-lg font-bold text-red-400 mb-4">Review Incorrect Answers</h4>
                    {wrongAnswers.map((item, idx) => (
                        <div key={idx} className="bg-gray-800/50 p-4 rounded-xl border border-gray-800/50">
                            <p className="text-white font-medium mb-3">{item.question.question}</p>

                            <div className="space-y-2 text-sm mb-3">
                                <div className="flex items-center gap-2 text-red-300 bg-red-900/20 p-2 rounded-lg">
                                    <span>❌ You chose:</span>
                                    <span className="font-bold">{item.question.options[item.selected]}</span>
                                </div>
                                <div className="flex items-center gap-2 text-green-300 bg-green-900/20 p-2 rounded-lg">
                                    <span>✅ Correct:</span>
                                    <span className="font-bold">{item.question.options[item.question.correctIndex]}</span>
                                </div>
                            </div>

                            <div className="text-xs text-gray-400 bg-black/20 p-3 rounded-lg border border-white/5">
                                💡 {item.question.explanation}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex gap-4">
                <button
                    onClick={() => setStatus("SETUP")}
                    className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-3 rounded-xl font-bold transition-colors"
                >
                    Close Result
                </button>
                <button
                    onClick={() => setStatus("SETUP")}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold transition-colors shadow-lg"
                >
                    Start New Quiz
                </button>
            </div>

        </div>
    );
}
