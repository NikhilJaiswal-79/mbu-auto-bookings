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
                <p className="animate-pulse">Loading MBU Platform...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950 text-white p-8">
            <div className="max-w-4xl mx-auto">
                {/* Header Removed as per user request (Logout moved to inner dashboards) */}

                {userProfile?.role === "student" && <StudentDashboard />}
                {userProfile?.role === "driver" && <DriverDashboard />}

                {!userProfile?.role && <div className="text-center text-gray-500">Loading role...</div>}

            </div>
        </div>
    );
}
