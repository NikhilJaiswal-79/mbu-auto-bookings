"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, db, googleProvider } from "@/lib/firebase";
import { doc, getDoc, onSnapshot } from "firebase/firestore";

interface UserProfile {
    role: "student" | "driver";
    name: string;
    email: string;
    phone?: string;
    collegeName?: string;
    homeAddress?: string;
    vehicleNumber?: string;
    parentContact?: {
        name: string;
        phone: string;
        email?: string;
    };
    savedAddresses?: { name: string; address: string; lat: number; lng: number }[];
    credits?: number;
    reputation?: number;
    subscription?: { status: string; expiry: string };
}

interface AuthContextType {
    user: User | null;
    userProfile: UserProfile | null;
    loading: boolean;
    signInWithGoogle: () => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let profileUnsub: (() => void) | null = null;

        const authUnsub = onAuthStateChanged(auth, (currentUser) => {
            // Cleanup previous listener if exists (e.g. logout or user switch)
            if (profileUnsub) {
                profileUnsub();
                profileUnsub = null;
            }

            setUser(currentUser);

            if (currentUser) {
                // Real-time listener for User Profile
                profileUnsub = onSnapshot(doc(db, "users", currentUser.uid), (docSnap) => {
                    if (docSnap.exists()) {
                        setUserProfile(docSnap.data() as UserProfile);
                    } else {
                        setUserProfile(null);
                    }
                    setLoading(false);
                }, (error) => {
                    console.error("Error fetching user profile", error);
                    setLoading(false);
                });
            } else {
                setUserProfile(null);
                setLoading(false);
            }
        });

        return () => {
            authUnsub();
            if (profileUnsub) profileUnsub();
        };
    }, []);

    const signInWithGoogle = async () => {
        try {
            await signInWithPopup(auth, googleProvider);
        } catch (error) {
            console.error("Error signing in with Google", error);
            throw error;
        }
    };

    const logout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Error signing out", error);
            throw error;
        }
    };

    return (
        <AuthContext.Provider value={{ user, userProfile, loading, signInWithGoogle, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};
