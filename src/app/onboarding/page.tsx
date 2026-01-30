"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function OnboardingPage() {
    const { user, userProfile, loading } = useAuth();
    const router = useRouter();
    const [role, setRole] = useState<"student" | "driver" | null>(null);
    const [submitLoading, setSubmitLoading] = useState(false);

    // Autocomplete State
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [activeField, setActiveField] = useState<"collegeName" | "homeAddress" | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        fullName: user?.displayName || "",
        phoneNumber: "",
        collegeName: "",
        mbuId: "",
        homeAddress: "",
        parentName: "",
        parentPhone: "",
        parentEmail: "",
        vehicleNumber: "",
    });

    useEffect(() => {
        if (!loading && !user) {
            router.push("/login");
        } else if (!loading && userProfile) {
            router.push("/dashboard");
        }
    }, [user, userProfile, loading, router]);

    // Address Autocomplete (Debounced)
    useEffect(() => {
        const query = activeField === "collegeName" ? formData.collegeName :
            activeField === "homeAddress" ? formData.homeAddress : "";

        if (!query || query.length < 3) {
            setSuggestions([]);
            return;
        }

        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=5`);
                const apiData = await res.json();
                setSuggestions(apiData);
            } catch (error) {
                console.error("Autocomplete error", error);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [formData.collegeName, formData.homeAddress, activeField]);

    const handleSelectSuggestion = (suggestion: any) => {
        if (activeField === "collegeName") {
            setFormData(prev => ({ ...prev, collegeName: suggestion.display_name }));
        } else if (activeField === "homeAddress") {
            setFormData(prev => ({ ...prev, homeAddress: suggestion.display_name }));
        }
        setSuggestions([]);
        setActiveField(null);
    };

    const handleRoleSelect = (selectedRole: "student" | "driver") => {
        setRole(selectedRole);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !role) return;

        setSubmitLoading(true);
        try {
            const profileData: any = {
                name: formData.fullName,
                email: user.email,
                role: role,
                phone: formData.phoneNumber,
                createdAt: new Date().toISOString(),
            };

            if (role === "student") {
                profileData.collegeName = formData.collegeName;
                profileData.mbuId = formData.mbuId;
                profileData.homeAddress = formData.homeAddress;
                // Initialize default saved addresses
                profileData.savedAddresses = [
                    { name: "Home", address: formData.homeAddress },
                    { name: "College", address: formData.collegeName }
                ];
                profileData.parentContact = {
                    name: formData.parentName,
                    phone: formData.parentPhone,
                    email: formData.parentEmail,
                };
            } else if (role === "driver") {
                profileData.vehicleNumber = formData.vehicleNumber;
            }

            await setDoc(doc(db, "users", user.uid), profileData);
            window.location.href = "/dashboard";
        } catch (error) {
            console.error("Error saving profile", error);
        } finally {
            setSubmitLoading(false);
        }
    };

    if (loading) return <div className="min-h-screen text-white flex justify-center items-center">Loading...</div>;

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
            <h1 className="text-3xl font-bold text-white mb-8">
                {role ? `Complete Your ${role === 'student' ? 'Student' : 'Driver'} Profile` : "Select Your Role"}
            </h1>

            {!role ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
                    <div
                        onClick={() => handleRoleSelect("student")}
                        className="cursor-pointer p-8 rounded-2xl border-2 border-gray-800 bg-gray-900 hover:border-blue-500 hover:bg-blue-500/10 transition-all duration-200"
                    >
                        <div className="text-4xl mb-4">🎓</div>
                        <h2 className="text-xl font-bold text-white mb-2">I am a Student</h2>
                        <p className="text-gray-400">Book autos, share rides, and manage your commute.</p>
                    </div>

                    <div
                        onClick={() => handleRoleSelect("driver")}
                        className="cursor-pointer p-8 rounded-2xl border-2 border-gray-800 bg-gray-900 hover:border-green-500 hover:bg-green-500/10 transition-all duration-200"
                    >
                        <div className="text-4xl mb-4">🛺</div>
                        <h2 className="text-xl font-bold text-white mb-2">I am an Auto Driver</h2>
                        <p className="text-gray-400">Accept bookings, manage your schedule, and earn.</p>
                    </div>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="w-full max-w-md bg-gray-900 p-8 rounded-2xl border border-gray-800">

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Full Name</label>
                            <input
                                type="text"
                                name="fullName"
                                value={formData.fullName}
                                onChange={handleChange}
                                required
                                className="w-full bg-gray-800 border-none rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Phone Number</label>
                            <input
                                type="tel"
                                name="phoneNumber"
                                value={formData.phoneNumber}
                                onChange={handleChange}
                                required
                                placeholder="+91 99999 99999"
                                className="w-full bg-gray-800 border-none rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        {role === "student" && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">College Name</label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            name="collegeName"
                                            value={formData.collegeName}
                                            onChange={(e) => {
                                                handleChange(e);
                                                setActiveField("collegeName");
                                            }}
                                            onFocus={() => setActiveField("collegeName")}
                                            required
                                            placeholder="e.g. MBU, SV University"
                                            className="w-full bg-gray-800 border-none rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500"
                                            autoComplete="off"
                                        />
                                        {activeField === "collegeName" && suggestions.length > 0 && (
                                            <div className="absolute top-full left-0 right-0 bg-gray-800 border border-gray-700 rounded-lg mt-1 z-50 shadow-xl max-h-40 overflow-y-auto">
                                                {suggestions.map((s, i) => (
                                                    <div key={i}
                                                        onClick={() => handleSelectSuggestion(s)}
                                                        className="p-3 hover:bg-gray-700 cursor-pointer text-sm text-gray-300 border-b border-gray-700/50"
                                                    >
                                                        {s.display_name}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Student ID / Roll No</label>
                                    <input
                                        type="text"
                                        name="mbuId"
                                        value={formData.mbuId}
                                        onChange={handleChange}
                                        required
                                        placeholder="e.g. 2023CS01"
                                        className="w-full bg-gray-800 border-none rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div className="col-span-1 md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Home Address (Local)</label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            name="homeAddress"
                                            value={formData.homeAddress}
                                            onChange={(e) => {
                                                handleChange(e);
                                                setActiveField("homeAddress");
                                            }}
                                            onFocus={() => setActiveField("homeAddress")}
                                            required
                                            placeholder="e.g. 123, Gandhi Road, Tirupati"
                                            className="w-full bg-gray-800 border-none rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500"
                                            autoComplete="off"
                                        />
                                        {activeField === "homeAddress" && suggestions.length > 0 && (
                                            <div className="absolute top-full left-0 right-0 bg-gray-800 border border-gray-700 rounded-lg mt-1 z-50 shadow-xl max-h-40 overflow-y-auto">
                                                {suggestions.map((s, i) => (
                                                    <div key={i}
                                                        onClick={() => handleSelectSuggestion(s)}
                                                        className="p-3 hover:bg-gray-700 cursor-pointer text-sm text-gray-300 border-b border-gray-700/50"
                                                    >
                                                        {s.display_name}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="pt-4 border-t border-gray-800">
                                    <h3 className="text-sm font-semibold text-gray-300 mb-3">Parent/Guardian Contact</h3>
                                    <div className="space-y-3">
                                        <input
                                            type="text"
                                            name="parentName"
                                            value={formData.parentName}
                                            onChange={handleChange}
                                            required
                                            placeholder="Parent Name"
                                            className="w-full bg-gray-800 border-none rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500"
                                        />
                                        <input
                                            type="tel"
                                            name="parentPhone"
                                            value={formData.parentPhone}
                                            onChange={handleChange}
                                            required
                                            placeholder="Parent Phone"
                                            className="w-full bg-gray-800 border-none rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500"
                                        />
                                        <input
                                            type="email"
                                            name="parentEmail"
                                            value={formData.parentEmail}
                                            onChange={handleChange}
                                            required
                                            placeholder="Parent Email"
                                            className="w-full bg-gray-800 border-none rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        {role === "driver" && (
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Vehicle Number</label>
                                <input
                                    type="text"
                                    name="vehicleNumber"
                                    value={formData.vehicleNumber}
                                    onChange={handleChange}
                                    required
                                    placeholder="AP 03 AB 1234"
                                    className="w-full bg-gray-800 border-none rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        )}
                    </div>

                    <div className="mt-8 flex gap-4">
                        <button
                            type="button"
                            onClick={() => setRole(null)}
                            className="px-4 py-3 text-gray-400 hover:text-white transition-colors"
                        >
                            Back
                        </button>
                        <button
                            type="submit"
                            disabled={submitLoading}
                            className="flex-1 bg-blue-600 text-white font-semibold py-3 px-4 rounded-xl hover:bg-blue-700 transition-colors shadow-lg active:scale-95 duration-200"
                        >
                            {submitLoading ? "Saving..." : "Create Profile"}
                        </button>
                    </div>
                </form>
            )
            }
        </div >
    );
}
