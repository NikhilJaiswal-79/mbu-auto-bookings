"use client";

import { useAuth } from "@/context/AuthContext";
import { useState, useEffect } from "react";
import { collection, addDoc, onSnapshot, doc, query, where, orderBy, updateDoc, increment } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { generateToken, subscribeToServingToken } from "@/lib/tokenService";
import RideSharing from "./RideSharing";
import AutomatedBooking from "./AutomatedBooking";
import WeatherWidget from "./WeatherWidget";
import SOSButton from "./SOSButton";
import QuizComponent from "./QuizComponent";

import dynamic from "next/dynamic";

const MapComponent = dynamic(() => import("./MapComponent"), { ssr: false });

export default function StudentDashboard() {
    const { user, userProfile } = useAuth();
    const [activeTab, setActiveTab] = useState<"auto" | "share" | "timetable">("auto");
    const [showMap, setShowMap] = useState(true);

    // Auto Booking State
    const [pickup, setPickup] = useState(userProfile?.collegeName || "MBU Campus");
    const [drop, setDrop] = useState("");
    const [rideType, setRideType] = useState<"instant" | "scheduled">("instant");
    const [paymentMode, setPaymentMode] = useState<"cash" | "credits" | "subscription">("cash");
    const [loading, setLoading] = useState(false);

    // Address & Pricing State
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [activeField, setActiveField] = useState<"pickup" | "drop" | null>(null);
    const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
    const [showSaveAddressModal, setShowSaveAddressModal] = useState(false);
    const [newAddress, setNewAddress] = useState({ name: "", address: "" });
    const [estimatedFare, setEstimatedFare] = useState(25);

    // Ride States
    const [currentBookingId, setCurrentBookingId] = useState<string | null>(null);
    const [bookingStatus, setBookingStatus] = useState<"IDLE" | "PENDING" | "CONFIRMED" | "COMPLETED">("IDLE");
    const [activeRide, setActiveRide] = useState<any>(null);

    // Token System State
    const [myToken, setMyToken] = useState<number | null>(null);
    const [servingToken, setServingToken] = useState<number | null>(null);

    // Wallet & History State
    const [showWallet, setShowWallet] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [history, setHistory] = useState<any[]>([]);

    // Mock Data (replace effectively with real data later)
    const [credits, setCredits] = useState(userProfile?.credits || 0);
    const [subscription, setSubscription] = useState<any>(userProfile?.subscription || null);

    // Sync profile data
    useEffect(() => {
        if (userProfile) {
            setCredits(userProfile.credits || 0);
            setSubscription(userProfile.subscription || null);
            if (userProfile.collegeName && pickup === "MBU Campus") {
                setPickup(userProfile.collegeName);
            }
            if (userProfile.savedAddresses) setSavedAddresses(userProfile.savedAddresses);
        }
    }, [userProfile]);

    // Edit Profile State
    const [showEditProfile, setShowEditProfile] = useState(false);
    const [editFormData, setEditFormData] = useState({
        name: "", phone: "", collegeName: "", homeAddress: "", parentName: "", parentPhone: "", parentEmail: ""
    });

    // Load initial data for Edit Profile
    useEffect(() => {
        if (userProfile && showEditProfile) {
            setEditFormData({
                name: userProfile.name || "",
                phone: userProfile.phone || "",
                collegeName: userProfile.collegeName || "",
                homeAddress: userProfile.homeAddress || "", // Assuming this field exists or we pull from savedAddresses[0]
                parentName: userProfile.parentContact?.name || "",
                parentPhone: userProfile.parentContact?.phone || "",
                parentEmail: userProfile.parentContact?.email || ""
            });
        }
    }, [userProfile, showEditProfile]);

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setLoading(true);
        try {
            await updateDoc(doc(db, "users", user.uid), {
                name: editFormData.name,
                phone: editFormData.phone,
                collegeName: editFormData.collegeName,
                homeAddress: editFormData.homeAddress, // Assuming we want to store this explicitly
                parentContact: {
                    name: editFormData.parentName,
                    phone: editFormData.parentPhone,
                    email: editFormData.parentEmail
                }
            });
            setShowEditProfile(false);
            alert("Profile Updated Successfully!");
        } catch (error) {
            console.error("Error updating profile", error);
            alert("Failed to update profile.");
        } finally {
            setLoading(false);
        }
    };



    {/* Navigation Tabs */ }
    useEffect(() => {
        if (!currentBookingId) return;

        const unsubscribe = onSnapshot(doc(db, "bookings", currentBookingId), (docSnapshot) => {
            if (docSnapshot.exists()) {
                const data = docSnapshot.data();
                setBookingStatus(data.status);
                if (data.status === "CONFIRMED") {
                    setActiveRide(data);
                }
            }
        });

        return () => unsubscribe();
    }, [currentBookingId]);

    // Listen for global serving token
    useEffect(() => {
        const unsubscribe = subscribeToServingToken((token) => {
            setServingToken(token);
        });
        return () => unsubscribe();
    }, []);

    // Fetch History
    useEffect(() => {
        if (user && showHistory) {
            const q = query(
                collection(db, "bookings"),
                where("studentId", "==", user.uid),
                where("status", "in", ["COMPLETED", "CANCELLED", "CONFIRMED"]),
                orderBy("createdAt", "desc")
            );
            const unsubscribe = onSnapshot(q, (snapshot) => {
                setHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            });
            return () => unsubscribe();
        }
    }, [user, showHistory]);

    const handleBuyCredits = async (amount: number, cost: number) => {
        if (!user || !confirm(`Buy ${amount} credits for ₹${cost}?`)) return;
        try {
            await updateDoc(doc(db, "users", user.uid), {
                credits: increment(amount)
            });
            setCredits(prev => prev + amount);
            alert("Purchase Successful! Credits Added.");
        } catch (error) {
            console.error(error);
            alert("Purchase Failed");
        }
    };

    const handleBuyPass = async (type: string, cost: number, days: number) => {
        if (!user || !confirm(`Buy ${type} pass for ₹${cost}?`)) return;
        try {
            const newSubscription = {
                active: true,
                type,
                expiryDate: new Date(Date.now() + days * 86400000).toISOString()
            };
            await updateDoc(doc(db, "users", user.uid), {
                subscription: newSubscription
            });
            setSubscription(newSubscription);
            alert("Pass Activated!");
        } catch (error) {
            console.error(error);
            alert("Purchase Failed");
        }
    };

    // Address Autocomplete (Debounced)
    useEffect(() => {
        const query = activeField === "pickup" ? pickup : drop;
        if (!query || query.length < 3) {
            setSuggestions([]);
            return;
        }
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=5`);
                const data = await res.json();
                setSuggestions(data);
            } catch (error) {
                console.error("Autocomplete error", error);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [pickup, drop, activeField]);

    const handleSelectSuggestion = (address: string) => {
        if (activeField === "pickup") setPickup(address);
        else setDrop(address);
        setSuggestions([]);
        setActiveField(null);
        // Recalc fare on selection
        calculateFare();
    };

    const calculateFare = () => {
        if (!pickup || !drop) return 0;

        // Deterministic Pseudo-Distance Logic (for demo purpose)
        // Combines lengths and first char codes to keep fare consistent for same inputs
        const pLen = pickup.length;
        const dLen = drop.length;
        const base = (pLen + dLen) % 7;
        const dist = base + 2; // Ranges from 2 to 8 km

        // Base Fare Calculation
        const baseFare = 20;
        const ratePerKm = 15;
        let fare = baseFare + (dist * ratePerKm);

        // Surge Pricing (9-10 AM, 5-6 PM)
        const hour = new Date().getHours();
        if ((hour === 9) || (hour === 17)) fare *= 1.5;

        setEstimatedFare(Math.round(fare));
    };

    const isOfficialRoute = () => {
        if (!userProfile) return false;

        const home = userProfile.homeAddress?.toLowerCase().trim() || "";
        const college = userProfile.collegeName?.toLowerCase().trim() || "";
        const p = pickup.toLowerCase().trim();
        const d = drop.toLowerCase().trim();

        // Check Home <-> College
        const isHomePickup = home && p.includes(home);
        const isCollegePickup = college && p.includes(college);
        const isHomeDrop = home && d.includes(home);
        const isCollegeDrop = college && d.includes(college);

        if ((isHomePickup && isCollegeDrop) || (isCollegePickup && isHomeDrop)) {
            return true;
        }
        return false;
    };

    const handleSaveAddress = async () => {
        if (!user || !newAddress.name || !newAddress.address) return;
        const updatedAddresses = [...savedAddresses, newAddress];
        await updateDoc(doc(db, "users", user.uid), { savedAddresses: updatedAddresses });
        setSavedAddresses(updatedAddresses);
        setNewAddress({ name: "", address: "" });
        setShowSaveAddressModal(false);
    };

    // Map Location Handler
    const handleLocationSelect = (lat: number, lng: number, address: string) => {
        if (showSaveAddressModal) {
            setNewAddress(prev => ({ ...prev, address: address }));
            return;
        }

        if (pickup === (userProfile?.collegeName || "MBU Campus") && !drop) {
            setDrop(address);
        } else if (confirm(`Set "${address}" as DROP location? (Cancel for PICKUP)`)) {
            setDrop(address);
        } else {
            setPickup(address);
        }
        // Defer calculation slightly to ensure state update
        setTimeout(calculateFare, 100);
    };

    const handleBookRide = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        // Payment Restriction Logic
        if (paymentMode !== "cash" && !isOfficialRoute()) {
            alert("⚠️ Credits & Pass are valid ONLY for Home <-> College rides.\nPlease select Cash for other routes.");
            setPaymentMode("cash");
            return;
        }

        if (paymentMode === "credits" && credits < 1) {
            alert("Insufficient Credits! Please top up.");
            setShowWallet(true);
            return;
        }
        if (paymentMode === "subscription" && (!subscription?.active)) {
            alert("No Active Subscription! Please buy a pass.");
            setShowWallet(true);
            return;
        }

        setLoading(true);
        try {
            const tokenNumber = await generateToken();
            setMyToken(tokenNumber);

            const rideData = {
                studentId: user.uid,
                studentName: userProfile?.name || "Student",
                pickup,
                drop,
                rideType,
                paymentMode,
                status: "PENDING",
                createdAt: new Date().toISOString(),
                tokenNumber: tokenNumber,
            };

            const docRef = await addDoc(collection(db, "bookings"), rideData);
            setCurrentBookingId(docRef.id);
            setBookingStatus("PENDING");

        } catch (error) {
            console.error("Error booking ride", error);
            alert("Failed to book ride");
        } finally {
            setLoading(false);
        }
    };

    const handleCancelRide = async () => {
        if (!currentBookingId) return;
        if (!confirm("Are you sure you want to cancel?")) return;

        try {
            await updateDoc(doc(db, "bookings", currentBookingId), {
                status: "CANCELLED"
            });
            handleEndRide();
            alert("Ride Cancelled");
        } catch (error) {
            console.error("Cancellation failed", error);
        }
    };

    const handleEndRide = () => {
        setActiveRide(null);
        setBookingStatus("IDLE");
        setCurrentBookingId(null);
        setMyToken(null);
    };

    if (bookingStatus === "PENDING") {
        return (
            <div className="flex flex-col items-center justify-center p-6 space-y-6 animate-fade-in">
                {/* Token Card */}
                <div className="bg-gradient-to-br from-yellow-500/10 to-transparent border border-yellow-500/50 p-8 rounded-3xl text-center w-full max-w-md shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-yellow-500 to-transparent animate-pulse"></div>

                    <div className="text-4xl mb-4">🎫</div>
                    <h2 className="text-xl font-bold text-yellow-500 mb-1">QUEUE STATUS</h2>

                    <div className="my-6">
                        <p className="text-gray-400 text-sm uppercase tracking-wider mb-2">Your Token Number</p>
                        <div className="text-6xl font-black text-white tracking-tight">{myToken}</div>
                    </div>

                    <div className="bg-black/40 rounded-xl p-4 border border-white/5 space-y-2">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-400">Currently Serving</span>
                            <span className="text-green-400 font-mono font-bold">Token {servingToken || "-"}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-400">Status</span>
                            <span className="text-yellow-400 animate-pulse">Waiting for confirmation...</span>
                        </div>
                    </div>
                </div>

                <div className="w-full max-w-md bg-gray-900/50 p-4 rounded-xl border border-gray-800 backdrop-blur-sm">
                    <div className="flex justify-between text-sm text-gray-300 mb-2">
                        <span>Pickup</span>
                        <span className="text-white font-semibold">{pickup}</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-300">
                        <span>Drop</span>
                        <span className="text-white font-semibold">{drop}</span>
                    </div>
                </div>

                <button
                    onClick={handleCancelRide}
                    className="text-red-400 hover:text-red-300 text-sm font-medium transition-colors"
                >
                    Cancel Request
                </button>
            </div>
        );
    }

    if (activeRide && bookingStatus === "CONFIRMED") {
        return (
            <div className="space-y-6 animate-fade-in">
                <div className="bg-green-900/20 border border-green-500/50 p-6 rounded-2xl text-center">
                    <h2 className="text-2xl font-bold text-green-400 mb-2">Ride in Progress 🛺</h2>
                    <p className="text-gray-300">Heading to <span className="text-white font-bold">{activeRide.drop}</span></p>
                    <p className="text-sm text-gray-500 mt-2">Token: {activeRide.tokenNumber}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <QuizComponent isActive={true} />
                    <div className="space-y-6">
                        <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800">
                            <h3 className="text-lg font-bold text-white mb-4">Ride Controls</h3>
                            <button
                                onClick={async () => {
                                    if (currentBookingId) {
                                        await updateDoc(doc(db, "bookings", currentBookingId), { status: "COMPLETED" });
                                    }
                                    handleEndRide();
                                }}
                                className="w-full bg-gray-800 hover:bg-gray-700 text-white py-3 rounded-xl mb-4 font-semibold"
                            >
                                Complete Ride (Student)
                            </button>
                        </div>
                        <SOSButton rideDetails={activeRide} />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 relative">
            {/* Edit Profile Modal */}
            {showEditProfile && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
                    <div className="bg-gray-900 w-full max-w-lg rounded-2xl border border-gray-800 p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-white">Edit Profile ✏️</h2>
                            <button onClick={() => setShowEditProfile(false)} className="text-gray-400 hover:text-white">✕</button>
                        </div>
                        <form onSubmit={handleUpdateProfile} className="space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Full Name</label>
                                <input type="text" className="w-full bg-gray-800 rounded-lg p-3 text-white border border-gray-700"
                                    value={editFormData.name} onChange={e => setEditFormData({ ...editFormData, name: e.target.value })} required />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Phone Number</label>
                                <input type="tel" className="w-full bg-gray-800 rounded-lg p-3 text-white border border-gray-700"
                                    value={editFormData.phone} onChange={e => setEditFormData({ ...editFormData, phone: e.target.value })} required />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">College Name</label>
                                <input type="text" className="w-full bg-gray-800 rounded-lg p-3 text-white border border-gray-700"
                                    value={editFormData.collegeName} onChange={e => setEditFormData({ ...editFormData, collegeName: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Home Address</label>
                                <input type="text" className="w-full bg-gray-800 rounded-lg p-3 text-white border border-gray-700"
                                    value={editFormData.homeAddress} onChange={e => setEditFormData({ ...editFormData, homeAddress: e.target.value })} />
                            </div>

                            <div className="border-t border-gray-800 pt-4 mt-4">
                                <h3 className="text-sm font-bold text-gray-300 mb-3 uppercase tracking-wider">Parent/Guardian Details</h3>
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">Parent Name</label>
                                        <input type="text" className="w-full bg-gray-800 rounded-lg p-3 text-white border border-gray-700"
                                            value={editFormData.parentName} onChange={e => setEditFormData({ ...editFormData, parentName: e.target.value })} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">Parent Phone</label>
                                            <input type="tel" className="w-full bg-gray-800 rounded-lg p-3 text-white border border-gray-700"
                                                value={editFormData.parentPhone} onChange={e => setEditFormData({ ...editFormData, parentPhone: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">Parent Email</label>
                                            <input type="email" className="w-full bg-gray-800 rounded-lg p-3 text-white border border-gray-700"
                                                value={editFormData.parentEmail} onChange={e => setEditFormData({ ...editFormData, parentEmail: e.target.value })} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl mt-6">
                                Save Changes
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Save Address Modal */}
            {showSaveAddressModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
                    <div className="bg-gray-900 w-full max-w-sm rounded-2xl border border-gray-800 p-6 space-y-4">
                        <h3 className="text-xl font-bold text-white">Save New Place</h3>

                        <input type="text" placeholder="Place Name (e.g. Home, Gym)" className="w-full bg-gray-800 p-3 rounded-lg text-white border border-gray-700"
                            value={newAddress.name} onChange={(e) => setNewAddress({ ...newAddress, name: e.target.value })} />

                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Address (Type or Tap on Map)"
                                className="w-full bg-gray-800 p-3 rounded-lg text-white border border-gray-700"
                                value={newAddress.address}
                                onChange={(e) => {
                                    setNewAddress({ ...newAddress, address: e.target.value });
                                    setActiveField("pickup"); // Hack to trigger same suggestions logic, or reuse a dedicated field
                                    setPickup(e.target.value); // Temporarily sync with pickup state to trigger autocomplete hook
                                }}
                            />
                            {/* Reusing existing Suggestion UI for simplicity, ideally separate activeField state */}
                            <p className="text-xs text-gray-400 mt-1">💡 Tip: You can also tap a location on the map behind this modal.</p>
                        </div>

                        <div className="flex gap-2">
                            <button onClick={() => setShowSaveAddressModal(false)} className="flex-1 py-2 text-gray-400">Cancel</button>
                            <button onClick={handleSaveAddress} className="flex-1 bg-blue-600 text-white py-2 rounded-lg">Save</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Wallet Modal */}
            {showWallet && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
                    <div className="bg-gray-900 w-full max-w-lg rounded-2xl border border-gray-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-white">My Wallet 💳</h2>
                            <button onClick={() => setShowWallet(false)} className="text-gray-400 hover:text-white">✕</button>
                        </div>

                        <div className="p-6 space-y-6 overflow-y-auto">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-gray-800 p-4 rounded-xl text-center">
                                    <p className="text-gray-400 text-xs uppercase mb-1">Credits Balance</p>
                                    <p className="text-3xl font-bold text-yellow-400">{credits}</p>
                                </div>
                                <div className="bg-gray-800 p-4 rounded-xl text-center">
                                    <p className="text-gray-400 text-xs uppercase mb-1">Active Plan</p>
                                    <p className="text-lg font-bold text-blue-400 capitalize">
                                        {subscription?.active ? subscription.type : "None"}
                                    </p>
                                </div>
                            </div>

                            <div>
                                <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3">Buy Credits (One-Tap)</h3>
                                <div className="grid grid-cols-3 gap-3">
                                    <button onClick={() => handleBuyCredits(10, 100)} className="bg-gray-800 hover:bg-gray-700 border border-transparent p-3 rounded-xl transition-all">
                                        <div className="text-xl font-bold text-white">10</div>
                                        <div className="text-xs text-gray-400">₹100</div>
                                    </button>
                                    <button onClick={() => handleBuyCredits(20, 200)} className="bg-gray-800 hover:bg-gray-700 border border-transparent p-3 rounded-xl transition-all">
                                        <div className="text-xl font-bold text-white">20</div>
                                        <div className="text-xs text-gray-400">₹200</div>
                                    </button>
                                    <button onClick={() => handleBuyCredits(30, 300)} className="bg-gray-800 hover:bg-gray-700 border border-transparent p-3 rounded-xl transition-all">
                                        <div className="text-xl font-bold text-white">30</div>
                                        <div className="text-xs text-gray-400">₹300</div>
                                    </button>
                                </div>
                            </div>

                            <div>
                                <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3">Subscriptions</h3>
                                <div className="space-y-3">
                                    <button onClick={() => handleBuyPass("monthly", 800, 30)} className="w-full flex justify-between items-center bg-gray-800 hover:bg-blue-900/20 p-4 rounded-xl">
                                        <div className="text-left"><div className="font-bold text-white">Monthly Pass</div><div className="text-xs text-gray-400">30 days</div></div>
                                        <div className="font-bold text-blue-400">₹800</div>
                                    </button>
                                    <button onClick={() => handleBuyPass("quarterly", 2000, 90)} className="w-full flex justify-between items-center bg-gray-800 hover:bg-blue-900/20 p-4 rounded-xl">
                                        <div className="text-left"><div className="font-bold text-white">Quarterly Pass</div><div className="text-xs text-gray-400">90 days</div></div>
                                        <div className="font-bold text-blue-400">₹2000</div>
                                    </button>
                                    <button onClick={() => handleBuyPass("yearly", 6500, 365)} className="w-full flex justify-between items-center bg-gray-800 hover:bg-blue-900/20 p-4 rounded-xl">
                                        <div className="text-left"><div className="font-bold text-white">Yearly Pass</div><div className="text-xs text-gray-400">365 days</div></div>
                                        <div className="font-bold text-blue-400">₹6500</div>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* History Modal */}
            {showHistory && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
                    <div className="bg-gray-900 w-full max-w-lg rounded-2xl border border-gray-800 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-white">Ride History 📜</h2>
                            <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-white">✕</button>
                        </div>

                        <div className="p-4 overflow-y-auto flex-1 space-y-3">
                            {history.length === 0 ? (
                                <p className="text-center text-gray-500 py-4">No ride history found.</p>
                            ) : (
                                <div className="space-y-4">
                                    {history.map((ride) => (
                                        <div key={ride.id} className="bg-[#1e293b] p-5 rounded-xl border border-gray-700/50 shadow-lg animate-fade-in relative overflow-hidden">
                                            {/* Header */}
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-white font-bold text-lg">{new Date(ride.createdAt).toLocaleDateString("en-GB")}</span>
                                                    <span className="bg-[#451a03] text-[#f59e0b] px-2 py-1 rounded text-xs font-bold border border-[#f59e0b]/30">
                                                        Ticket #{ride.tokenNumber}
                                                    </span>
                                                </div>
                                                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${ride.status === "COMPLETED" ? "bg-green-500/20 text-green-400" :
                                                    ride.status === "CANCELLED" ? "bg-red-500/20 text-red-400" :
                                                        ride.status === "CONFIRMED" ? "bg-blue-500/20 text-blue-400" :
                                                            "bg-yellow-500/20 text-yellow-500"
                                                    }`}>
                                                    {ride.status}
                                                </span>
                                            </div>

                                            {/* Locations */}
                                            <div className="space-y-3 mb-4 pl-1">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-2 h-2 rounded-full border-[3px] border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
                                                    <div className="text-gray-300">
                                                        <span className="font-bold text-gray-400 mr-2">Pickup:</span>
                                                        {ride.pickup}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="w-2 h-2 rounded-full border-[3px] border-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]"></div>
                                                    <div className="text-gray-300">
                                                        <span className="font-bold text-gray-400 mr-2">Drop:</span>
                                                        {ride.drop}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Footer Info */}
                                            <div className="flex items-center gap-4 text-sm text-gray-500 border-t border-gray-700/50 pt-3">
                                                <div className="flex items-center gap-1">
                                                    <span>🕒</span>
                                                    {new Date(ride.createdAt).toLocaleTimeString()}
                                                </div>
                                                <div className="flex items-center gap-1 capitalize">
                                                    <span>💳</span>
                                                    {ride.paymentMode}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center">
                <WeatherWidget />
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowMap(!showMap)}
                        className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-xl text-sm font-bold border border-gray-700"
                    >
                        {showMap ? "Hide Map 🗺️" : "Show Map 🗺️"}
                    </button>
                    <button
                        onClick={() => setShowEditProfile(true)}
                        className="bg-gray-800 hover:bg-gray-700 text-blue-400 px-3 py-2 rounded-xl text-sm font-bold border border-gray-700"
                    >
                        👤 Profile
                    </button>
                    <button
                        onClick={() => setShowHistory(true)}
                        className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-xl text-sm font-bold border border-gray-700"
                    >
                        📜 History
                    </button>
                    <button
                        onClick={() => setShowWallet(true)}
                        className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-xl text-sm font-bold border border-gray-700 flex items-center gap-2"
                    >
                        <span>💳 Wallet</span>
                        {credits > 0 && <span className="bg-yellow-500 text-black text-xs px-1.5 py-0.5 rounded-full">{credits}</span>}
                    </button>
                </div>
            </div>

            {/* MAP SECTION */}
            {showMap && (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-1 h-72 mb-6 shadow-inner relative z-0">
                    <MapComponent onLocationSelect={handleLocationSelect} />
                    <div className="absolute bottom-4 left-4 right-4 bg-black/60 backdrop-blur-md p-3 rounded-xl text-center text-xs text-white border border-white/10 z-[400]">
                        👆 Tap on map to auto-fill location • Fare updates automatically
                    </div>
                </div>
            )}

            {/* Navigation Tabs */}
            <div className="flex flex-wrap bg-gray-900 p-1 rounded-xl border border-gray-800 gap-1">
                <button
                    onClick={() => setActiveTab("auto")}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${activeTab === "auto" ? "bg-yellow-500 text-black shadow-lg" : "text-gray-400 hover:text-white"
                        }`}
                >
                    Book Auto
                </button>
                <button
                    onClick={() => setActiveTab("share")}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${activeTab === "share" ? "bg-purple-600 text-white shadow-lg" : "text-gray-400 hover:text-white"
                        }`}
                >
                    Ride Sharing
                </button>
                <button
                    onClick={() => setActiveTab("timetable")}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${activeTab === "timetable" ? "bg-blue-600 text-white shadow-lg" : "text-gray-400 hover:text-white"
                        }`}
                >
                    Automated (AI)
                </button>
            </div>

            {activeTab === "auto" && (
                <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-white">Book an Auto</h2>
                        <div className="text-right">
                            <p className="text-xs text-gray-400">Est. Fare</p>
                            <p className="text-2xl font-bold text-green-400">₹{estimatedFare}</p>
                        </div>
                    </div>

                    <form onSubmit={handleBookRide} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Pickup Input */}
                            <div className="relative">
                                <div className="flex justify-between mb-1">
                                    <label className="text-sm text-gray-400">Pickup Location</label>
                                    <button type="button" onClick={() => setShowSaveAddressModal(true)} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">+ Save Place</button>
                                </div>
                                <input
                                    type="text"
                                    value={pickup}
                                    onChange={(e) => { setPickup(e.target.value); setActiveField("pickup"); }}
                                    onFocus={() => setActiveField("pickup")}
                                    list="saved-places"
                                    className="w-full bg-gray-800 rounded-lg p-3 text-white border border-gray-700 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    placeholder="Enter pickup location"
                                />
                                {activeField === "pickup" && suggestions.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 bg-gray-800 border border-gray-700 rounded-lg mt-1 z-50 shadow-xl max-h-48 overflow-y-auto">
                                        {suggestions.map((s, i) => (
                                            <div key={i} onClick={() => handleSelectSuggestion(s.display_name)} className="p-3 hover:bg-gray-700 cursor-pointer text-sm text-gray-300 border-b border-gray-700/50 last:border-none">
                                                {s.display_name}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Drop Input */}
                            <div className="relative">
                                <label className="block text-sm text-gray-400 mb-1">Drop Location</label>
                                <input
                                    type="text"
                                    value={drop}
                                    onChange={(e) => { setDrop(e.target.value); setActiveField("drop"); }}
                                    onFocus={() => setActiveField("drop")}
                                    list="saved-places"
                                    className="w-full bg-gray-800 rounded-lg p-3 text-white border border-gray-700 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    placeholder="Enter destination"
                                    required
                                />
                                {activeField === "drop" && suggestions.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 bg-gray-800 border border-gray-700 rounded-lg mt-1 z-50 shadow-xl max-h-48 overflow-y-auto">
                                        {suggestions.map((s, i) => (
                                            <div key={i} onClick={() => handleSelectSuggestion(s.display_name)} className="p-3 hover:bg-gray-700 cursor-pointer text-sm text-gray-300 border-b border-gray-700/50 last:border-none">
                                                {s.display_name}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Datalist for Saved Places */}
                        <datalist id="saved-places">
                            <option value={userProfile?.collegeName || "MBU Campus"} />
                            {savedAddresses.map((addr, i) => (
                                <option key={i} value={addr.address}>{addr.name}</option>
                            ))}
                        </datalist>

                        <div className="flex gap-4">
                            <button
                                type="button"
                                onClick={() => setRideType("instant")}
                                className={`flex-1 p-3 rounded-lg border transition-all ${rideType === "instant" ? "border-blue-500 bg-blue-500/20 text-white" : "border-gray-700 text-gray-400 hover:border-gray-600"
                                    }`}
                            >
                                Instant Ride
                            </button>
                            <button
                                type="button"
                                onClick={() => setRideType("scheduled")}
                                className={`flex-1 p-3 rounded-lg border transition-all ${rideType === "scheduled" ? "border-blue-500 bg-blue-500/20 text-white" : "border-gray-700 text-gray-400 hover:border-gray-600"
                                    }`}
                            >
                                Schedule for Later
                            </button>
                        </div>

                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="block text-sm text-gray-400">Payment Mode</label>
                                <button type="button" onClick={() => setShowWallet(true)} className="text-xs text-blue-400 hover:text-blue-300">
                                    Top-up / Buy Pass
                                </button>
                            </div>
                            <div className="flex gap-4">
                                {["cash", "credits", "subscription"].map((mode) => (
                                    <label key={mode} className="flex items-center gap-2 text-gray-300 cursor-pointer p-2 bg-gray-800 rounded-lg border border-gray-700 flex-1 justify-center hover:bg-gray-700 transition">
                                        <input
                                            type="radio"
                                            name="payment"
                                            value={mode}
                                            checked={paymentMode === mode}
                                            onChange={(e) => setPaymentMode(e.target.value as any)}
                                            className="text-blue-500 focus:ring-blue-500 bg-gray-700 border-gray-500"
                                        />
                                        <span className="capitalize text-sm">{mode}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 rounded-xl transition-colors shadow-lg active:scale-95 duration-200"
                        >
                            {loading ? "Requesting..." : `Book Auto Now • ₹${estimatedFare}`}
                        </button>
                    </form>
                </div>
            )}

            {activeTab === "share" && <RideSharing />}
            {activeTab === "timetable" && <AutomatedBooking />}
        </div>
    );
}
