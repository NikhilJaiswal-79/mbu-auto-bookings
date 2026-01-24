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

    if (loading) return <div className="text-white">Loading...</div>;

    return (
        <div className="min-h-screen bg-gray-950 text-white p-8">
            <div className="max-w-4xl mx-auto">
                <header className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-2xl font-bold">Dashboard</h1>
                        {userProfile && <p className="text-gray-400 capitalize">Welcome, {userProfile.role} {userProfile.name}</p>}
                    </div>
                    <button
                        onClick={() => logout()}
                        className="px-4 py-2 bg-red-600 rounded-lg hover:bg-red-700 transition"
                    >
                        Logout
                    </button>
                </header>

                {userProfile?.role === "student" && <StudentDashboard />}
                {userProfile?.role === "driver" && <DriverDashboard />}

                {!userProfile?.role && <div className="text-center text-gray-500">Loading role...</div>}

            </div>
        </div>
    );
}
