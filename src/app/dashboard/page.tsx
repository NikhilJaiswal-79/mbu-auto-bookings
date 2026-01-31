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
                <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin shadow-[0_0_20px_rgba(59,130,246,0.5)]"></div>
                <p className="animate-pulse font-bold text-blue-400">Loading CampusRide...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950 text-white bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/10 via-gray-950 to-gray-950">
            {/* GLOBAL HEADER (Taskbar-like) */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-950/80 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex justify-between items-center shadow-lg">
                <div className="flex items-center gap-3">
                    <span className="text-2xl bg-blue-500/20 w-10 h-10 flex items-center justify-center rounded-xl shadow-lg border border-white/5">🛺</span>
                    <span className="text-xl font-black bg-gradient-to-r from-white via-blue-100 to-gray-300 bg-clip-text text-transparent tracking-tight">
                        CampusRide
                    </span>
                </div>
                <div className="flex items-center gap-6">
                    {userProfile && (
                        <div className="text-right hidden sm:block">
                            <p className="text-sm font-bold text-white leading-none">{userProfile.name}</p>
                            <p className="text-xs text-blue-400 capitalize font-medium">{userProfile.role}</p>
                        </div>
                    )}
                    <button
                        onClick={logout}
                        className="bg-red-500/10 hover:bg-red-500 hover:text-white text-red-500 text-sm font-bold py-2.5 px-5 rounded-xl border border-red-500/20 transition-all shadow-lg active:scale-95"
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
