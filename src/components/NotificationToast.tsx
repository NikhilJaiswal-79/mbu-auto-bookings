"use client";

import { useState, useEffect } from "react";

export type ToastType = "success" | "error" | "info";

interface ToastProps {
    message: string;
    type: ToastType;
    onClose: () => void;
}

export function NotificationToast({ message, type, onClose }: ToastProps) {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, 3000);
        return () => clearTimeout(timer);
    }, [onClose]);

    const bgColors = {
        success: "bg-green-600",
        error: "bg-red-600",
        info: "bg-blue-600"
    };

    const icons = {
        success: "✅",
        error: "❌",
        info: "ℹ️"
    };

    return (
        <div className={`fixed bottom-4 right-4 z-[100] ${bgColors[type]} text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-slide-in`}>
            <span>{icons[type]}</span>
            <span className="font-semibold">{message}</span>
            <button onClick={onClose} className="ml-2 hover:bg-white/20 rounded-full p-1">✕</button>
        </div>
    );
}

// Add this to your global css for the animation
// @keyframes slide-in {
//     from { transform: translateX(100%); opacity: 0; }
//     to { transform: translateX(0); opacity: 1; }
// }
// .animate-slide-in { animation: slide-in 0.3s ease-out; }
