"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import StudentDashboard from "@/components/StudentDashboard";
import DriverDashboard from "@/components/DriverDashboard";

export default function DashboardPage() {
    const { user, userProfile, loading, logout } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && !user) {
            router.push("/login");
        } else if (!loading && user && !userProfile) {
            router.push("/onboarding");
        }
    }, [user, userProfile, loading, router]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-white space-y-4">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="animate-pulse">Loading CampusRide...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            {/* GLOBAL HEADER (Taskbar-like) */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-900/90 backdrop-blur-md border-b border-gray-800 px-6 py-4 flex justify-between items-center shadow-lg">
                <div className="flex items-center gap-2">
                    <span className="text-2xl">🛺</span>
                    <span className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                        CampusRide
                    </span>
                </div>
                <div className="flex items-center gap-4">
                    {userProfile && (
                        <div className="text-right hidden sm:block">
                            <p className="text-sm font-bold text-white leading-none">{userProfile.name}</p>
                            <p className="text-xs text-gray-400 capitalize">{userProfile.role}</p>
                        </div>
                    )}
                    <button
                        onClick={logout}
                        className="bg-red-500/10 hover:bg-red-600 hover:text-white text-red-500 text-sm font-bold py-2 px-4 rounded-lg border border-red-500/20 transition-all"
                    >
                        Logout
                    </button>
                </div>
            </nav>

            <div className="pt-24 px-4 pb-8">
                <div className="max-w-5xl mx-auto">
                    {userProfile?.role === "student" && <StudentDashboard />}
                    {userProfile?.role === "driver" && <DriverDashboard />}

                    {!userProfile?.role && <div className="text-center text-gray-500">Loading role...</div>}
                </div>
            </div>
        </div>
    );
}
