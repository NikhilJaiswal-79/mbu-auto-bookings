"use client";

import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInAnonymously, updateProfile, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export default function LoginPage() {
    const { user, signInWithGoogle, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (user && !loading) {
            router.push("/dashboard");
        }
    }, [user, loading, router]);

    const [isJudgeLoading, setIsJudgeLoading] = useState(false);

    const handleLogin = async () => {
        try {
            await signInWithGoogle();
        } catch (error) {
            console.error("Login failed", error);
        }
    };

    const handleJudgeLogin = async () => {
        setIsJudgeLoading(true);
        try {
            let user;
            try {
                // 1. Try Anonymous First
                const result = await signInAnonymously(auth);
                user = result.user;
            } catch (anonError: any) {
                console.warn("Anonymous Auth failed, trying Email/Pass...", anonError);
                if (anonError.code === 'auth/admin-restricted-operation' || anonError.message.includes('enable')) {
                    // 2. Fallback to Email/Password
                    try {
                        const email = "judge@campusride.demo";
                        const password = "demoPassword123!";
                        try {
                            const result = await signInWithEmailAndPassword(auth, email, password);
                            user = result.user;
                        } catch (signinError: any) {
                            if (signinError.code === 'auth/user-not-found' || signinError.code === 'auth/invalid-credential') {
                                const result = await createUserWithEmailAndPassword(auth, email, password);
                                user = result.user;
                            } else {
                                throw signinError;
                            }
                        }
                    } catch (emailError: any) {
                        throw new Error(`Anonymous AND Email/Pass failed. Enable one in Firebase Console. (${emailError.message})`);
                    }
                } else {
                    throw anonError;
                }
            }

            if (!user) throw new Error("No user created");

            // 3. Seed Judge Profile
            const judgeProfile = {
                name: "Hackathon Judge",
                email: "judge@campusride.demo",
                role: "student",
                credits: 20, // Pre-filled credits
                subscription: {
                    active: true,
                    type: "Premium Pass",
                    expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 Days
                },
                homeAddress: "Flat 402, Golden Towers, AK Road, Tirupati",
                collegeName: "Mohan Babu University",
                phone: "9999999999",
                savedAddresses: [
                    {
                        type: "Home",
                        name: "Home",
                        address: "Flat 402, Golden Towers, AK Road, Tirupati",
                        lat: 13.6288,
                        lng: 79.4192
                    },
                    {
                        type: "College",
                        name: "College",
                        address: "Mohan Babu University",
                        lat: 13.6288,
                        lng: 79.4192
                    }
                ]
            };

            await setDoc(doc(db, "users", user.uid), judgeProfile, { merge: true });

            // 4. Update Auth Profile (Display Name)
            await updateProfile(user, { displayName: "Hackathon Judge" });

            console.log("Judge Logged In & Seeded!");
            // Router redirect handled by useEffect
        } catch (error: any) {
            console.error("Judge Login Failed:", error);
            alert(`Login Failed: ${error.message}\n\nPlease enable 'Anonymous' OR 'Email/Password' provider in Firebase Console.`);
            setIsJudgeLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
                Loading...
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
            <div className="max-w-md w-full bg-gray-900 p-8 rounded-2xl shadow-xl border border-gray-800 text-center">
                <h1 className="text-3xl font-bold text-white mb-2">Welcome to CampusRide</h1>
                <p className="text-gray-400 mb-8">Secure, reliable transportation for students.</p>

                <button
                    onClick={handleLogin}
                    className="w-full flex items-center justify-center gap-3 bg-white text-gray-900 font-semibold py-3 px-4 rounded-xl hover:bg-gray-100 transition-colors shadow-lg active:scale-95 duration-200"
                >
                    <img
                        src="https://www.google.com/favicon.ico"
                        alt="Google"
                        className="w-5 h-5"
                    />
                    Sign in with Google
                </button>

                <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-800"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-gray-900 text-gray-400">For Hackathon Judges</span>
                    </div>
                </div>

                <button
                    onClick={handleJudgeLogin}
                    disabled={isJudgeLoading}
                    className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-pink-600 to-purple-600 text-white font-bold py-3 px-4 rounded-xl hover:from-pink-500 hover:to-purple-500 transition-all shadow-lg shadow-purple-900/40 active:scale-95 duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <span className="text-xl">👨‍⚖️</span>
                    {isJudgeLoading ? "Setting up Demo..." : "Judge Login (Demo Mode)"}
                </button>
            </div>
        </div>
    );
}
