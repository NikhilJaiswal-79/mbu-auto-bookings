"use client";

import { useState, useEffect, useRef } from "react";
import { parseVoiceCommand } from "@/lib/gemini";

interface VoiceBookingAgentProps {
    onBookingParsed: (bookingData: any) => void;
    savedAddresses: any[];
}

export default function VoiceBookingAgent({ onBookingParsed, savedAddresses }: VoiceBookingAgentProps) {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        if (typeof window !== "undefined" && "webkitSpeechRecognition" in window) {
            // @ts-ignore
            recognitionRef.current = new window.webkitSpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.interimResults = false;
            recognitionRef.current.lang = "en-IN"; // English (India)

            recognitionRef.current.onstart = () => {
                setIsListening(true);
                setTranscript("");
            };

            recognitionRef.current.onresult = (event: any) => {
                const text = event.results[0][0].transcript;
                setTranscript(text);
                handleProcessing(text);
            };

            recognitionRef.current.onerror = (event: any) => {
                console.error("Speech Error:", event.error);
                setIsListening(false);
                setIsProcessing(false);
                // Optionally alert user or silent fail
            };

            recognitionRef.current.onend = () => {
                setIsListening(false);
            };
        }
    }, [savedAddresses]); // Re-init on address change? Not needed heavily but safe.

    const handleProcessing = async (text: string) => {
        setIsProcessing(true);
        try {
            console.log("Analyzing Voice Command:", text);
            const parsedData = await parseVoiceCommand(text, savedAddresses);
            console.log("Parsed Data:", parsedData);

            if (parsedData) {
                onBookingParsed({
                    ...parsedData, // pickup, drop, rideType, scheduledTime
                    originalTranscript: text
                });
            }
        } catch (error) {
            console.error("Failed to process voice command", error);
            alert("Sorry, I couldn't understand that. Please try again.");
        } finally {
            setIsProcessing(false);
        }
    };

    const toggleListening = () => {
        if (!recognitionRef.current) {
            alert("Voice recognition not supported in this browser.");
            return;
        }

        if (isListening) {
            recognitionRef.current.stop();
        } else {
            recognitionRef.current.start();
        }
    };

    return (
        <button
            onClick={toggleListening}
            disabled={isProcessing}
            className={`fixed bottom-24 right-6 z-40 p-4 rounded-full shadow-2xl transition-all active:scale-95 border-2 ${isListening
                    ? "bg-red-500 border-red-300 animate-pulse scale-110"
                    : isProcessing
                        ? "bg-indigo-600 border-indigo-400 rotate-180"
                        : "bg-blue-600 border-blue-400 hover:bg-blue-500"
                }`}
        >
            {isProcessing ? (
                <span className="text-2xl animate-spin">⏳</span>
            ) : isListening ? (
                <span className="text-2xl">🛑</span>
            ) : (
                <span className="text-2xl">🎙️</span>
            )}

            {/* Tooltip Label */}
            {!isListening && !isProcessing && (
                <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-gray-900 border border-gray-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                    Book by Voice
                </span>
            )}
        </button>
    );
}
