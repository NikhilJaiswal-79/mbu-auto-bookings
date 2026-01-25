"use client";

import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, updateDoc, doc, orderBy, runTransaction } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { subscribeToServingToken } from "@/lib/tokenService";
import { useAuth } from "@/context/AuthContext";

export default function DriverDashboard() {
    const { user, userProfile } = useAuth();
    const [requests, setRequests] = useState<any[]>([]);
    const [activeRides, setActiveRides] = useState<any[]>([]);
    const [servingToken, setServingToken] = useState<number | null>(null);
    const [showHistory, setShowHistory] = useState(false);
    const [history, setHistory] = useState<any[]>([]);
    const [dismissedIds, setDismissedIds] = useState<string[]>([]);
    const [showEarnings, setShowEarnings] = useState(false); // New State



    // Edit Profile State
    const [showEditProfile, setShowEditProfile] = useState(false);
    const [editFormData, setEditFormData] = useState({
        name: "", phone: "", vehicleNumber: ""
    });

    // Load initial data
    useEffect(() => {
        if (userProfile && showEditProfile) {
            setEditFormData({
                name: userProfile.name || "",
                phone: userProfile.phone || "",
                vehicleNumber: userProfile.vehicleNumber || ""
            });
        }
    }, [userProfile, showEditProfile]);

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        try {
            await updateDoc(doc(db, "users", user.uid), {
                name: editFormData.name,
                phone: editFormData.phone,
                vehicleNumber: editFormData.vehicleNumber
            });
            setShowEditProfile(false);
            alert("Profile Updated Successfully!");
        } catch (error) {
            console.error("Error updating profile", error);
            alert("Failed to update profile.");
        }
    };

    useEffect(() => {
        // Listen for PENDING bookings
        const q = query(
            collection(db, "bookings"),
            where("status", "==", "PENDING"),
            orderBy("tokenNumber", "asc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const bookings: any[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                // Filter for TODAY only (Client-side)
                const rideDate = new Date(data.createdAt);
                const today = new Date();
                const isToday = rideDate.getDate() === today.getDate() &&
                    rideDate.getMonth() === today.getMonth() &&
                    rideDate.getFullYear() === today.getFullYear();

                if (isToday) {
                    bookings.push({ id: doc.id, ...data });
                }
            });
            setRequests(bookings);
        });

        // Listen for My Active Rides (CONFIRMED)
        let activeUnsubscribe: () => void = () => { };
        if (user) {
            const activeQ = query(
                collection(db, "bookings"),
                where("driverId", "==", user.uid),
                where("status", "==", "CONFIRMED"),
                orderBy("createdAt", "desc")
            );
            activeUnsubscribe = onSnapshot(activeQ, (snapshot) => {
                setActiveRides(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            });
        }

        // Listen for Currently Serving (Confirmed) Token
        const tokenUnsub = subscribeToServingToken((token) => {
            setServingToken(token);
        });

        return () => {
            unsubscribe();
            activeUnsubscribe();
            tokenUnsub();
        };
    }, [user]);

    // Fetch History
    useEffect(() => {
        if (user && showHistory) {
            const q = query(
                collection(db, "bookings"),
                where("driverId", "==", user.uid),
                where("status", "in", ["COMPLETED", "CANCELLED", "CONFIRMED"]),
                orderBy("createdAt", "desc")
            );

            const unsubscribe = onSnapshot(q, (snapshot) => {
                setHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            });
            return () => unsubscribe();
        }
    }, [user, showHistory]);

    const handleAccept = async (booking: any) => {
        try {
            if (!userProfile) {
                alert("Driver profile not loaded. Please try again.");
                return;
            }

            await runTransaction(db, async (transaction) => {
                if (booking.paymentMode === "credits") {
                    const studentRef = doc(db, "users", booking.studentId);
                    const studentDoc = await transaction.get(studentRef);
                    if (!studentDoc.exists()) throw "User profile not found";

                    const newCredits = (studentDoc.data().credits || 0) - 1;
                    if (newCredits < 0) {
                        throw "Student has insufficient credits now";
                    }
                    transaction.update(studentRef, { credits: newCredits });
                }

                const bookingRef = doc(db, "bookings", booking.id);
                transaction.update(bookingRef, {
                    status: "CONFIRMED",
                    driverId: user?.uid,
                    driverName: userProfile.name || "Unknown Driver",
                    driverPhone: userProfile.phone || "Not Provided",
                    vehicleNumber: userProfile.vehicleNumber || "Unknown Vehicle", // Assuming vehicleNumber exists in profile
                });
            });
        } catch (error) {
            console.error("Error accepting ride", error);
            alert("Failed to accept: " + error);
        }
    };

    const handleReject = (rideId: string) => {
        if (confirm("Reject this ride request? It will be removed from your list.")) {
            setDismissedIds(prev => [...prev, rideId]);
        }
    };

    // Earnings Logic
    const calculateEarnings = () => {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const startOfWeek = new Date(now.setDate(now.getDate() - 7)).getTime(); // Last 7 days

        let todayCash = 0;
        let weekCash = 0;
        let todayRides = { cash: 0, credits: 0, subscription: 0 };
        let hourCounts: { [key: number]: number } = {};

        history.forEach(ride => {
            const rideTime = new Date(ride.createdAt).getTime();
            const rideDate = new Date(ride.createdAt);
            const isToday = rideTime >= startOfDay;
            const isWeek = rideTime >= startOfWeek;

            // Fares: Only Cash contributes to "Cash Earnings" for now.
            // User requested: "Show cash as 40" & "Show no. of credits/sub rides"
            const fare = ride.paymentMode === "cash" ? 40 : 0; // Only assume cash is liquid money

            if (isToday) {
                todayCash += fare;
                if (ride.paymentMode === "cash") todayRides.cash++;
                if (ride.paymentMode === "credits") todayRides.credits++;
                if (ride.paymentMode === "subscription") todayRides.subscription++;

                // Peak Hours (Today?) Or All time? Let's do All Time for better data, or Week.
                // Let's do All Time History for Peak Hours to get enough data.
            }
            if (isWeek) {
                weekCash += fare;
            }

            // Peak Hours Analysis (All History)
            const hour = rideDate.getHours();
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        });

        // Calc Peak Hour
        const peakHour = Object.keys(hourCounts).reduce((a, b) => hourCounts[parseInt(a)] > hourCounts[parseInt(b)] ? a : b, "0");
        const peakCount = hourCounts[parseInt(peakHour)] || 0;

        return { todayCash, weekCash, todayRides, peakHour, peakCount, hourCounts };
    };

    const earnings = calculateEarnings();

    return (
        <div className="space-y-6">
            {/* Earnings Modal */}
            {showEarnings && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
                    <div className="bg-gray-900 w-full max-w-2xl rounded-2xl border border-gray-800 shadow-2xl overflow-y-auto max-h-[90vh]">
                        <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900 sticky top-0 z-10">
                            <div>
                                <h2 className="text-2xl font-black text-white">Earnings & Insights 💰</h2>
                                <p className="text-gray-400 text-sm">Track your performance</p>
                            </div>
                            <button onClick={() => setShowEarnings(false)} className="text-gray-400 hover:text-white bg-gray-800 p-2 rounded-lg">✕</button>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Today's Summary */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-gradient-to-br from-green-900 to-green-800 p-6 rounded-2xl border border-green-500/30 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-4 opacity-10">
                                        <span className="text-8xl">₹</span>
                                    </div>
                                    <p className="text-green-200 font-bold uppercase tracking-wider text-xs mb-1">Today's Cash Earned</p>
                                    <h3 className="text-4xl font-black text-white">₹{earnings.todayCash}</h3>
                                    <p className="text-xs text-green-300 mt-2">Does not include online/credits</p>
                                </div>
                                <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
                                    <p className="text-gray-400 font-bold uppercase tracking-wider text-xs mb-3">Today's Rides Breakdown</p>
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center">
                                            <span className="flex items-center gap-2 text-white"><span className="text-green-500">💵</span> Cash Rides</span>
                                            <span className="font-bold text-white text-lg">{earnings.todayRides.cash}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="flex items-center gap-2 text-white"><span className="text-yellow-500">🪙</span> Credit Rides</span>
                                            <span className="font-bold text-white text-lg">{earnings.todayRides.credits}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="flex items-center gap-2 text-white"><span className="text-blue-500">📅</span> Pass Rides</span>
                                            <span className="font-bold text-white text-lg">{earnings.todayRides.subscription}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Weekly Stat */}
                            <div className="bg-[#111] p-6 rounded-2xl border border-gray-800 flex justify-between items-center">
                                <div>
                                    <p className="text-gray-400 text-xs font-bold uppercase">This Week's Cash</p>
                                    <p className="text-2xl font-bold text-white">₹{earnings.weekCash}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-gray-400 text-xs font-bold uppercase">Peak Time</p>
                                    <p className="text-xl font-bold text-orange-400">{earnings.peakHour}:00 - {parseInt(earnings.peakHour) + 1}:00</p>
                                </div>
                            </div>

                            {/* Peak Hours Chart */}
                            <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
                                <h3 className="text-white font-bold mb-6 flex items-center gap-2">
                                    <span>📊</span> Peak Earning Hours (All Time)
                                </h3>
                                <div className="h-32 flex items-end justify-between gap-1">
                                    {[8, 10, 12, 14, 16, 18, 20].map(hour => {
                                        const count = earnings.hourCounts[hour] || 0;
                                        const max = Math.max(...Object.values(earnings.hourCounts), 1);
                                        const height = (count / max) * 100;
                                        return (
                                            <div key={hour} className="flex-1 flex flex-col items-center gap-2 group">
                                                <div className="w-full bg-blue-500/20 rounded-t-lg relative group-hover:bg-blue-500/40 transition-colors" style={{ height: `${height || 10}%` }}>
                                                    {count > 0 && (
                                                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] px-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                                            {count}
                                                        </div>
                                                    )}
                                                </div>
                                                <span className="text-[10px] text-gray-500">{hour}h</span>
                                            </div>
                                        )
                                    })}
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
                                                        Token #{ride.tokenNumber}
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
                                            <div className="flex items-center justify-between text-sm text-gray-500 border-t border-gray-700/50 pt-3">
                                                <div className="flex items-center gap-4">
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

                                            {/* Driver Specific: Student Details */}
                                            <div className="mt-3 bg-[#111827] p-3 rounded-lg border border-gray-800 text-xs">
                                                <div className="flex justify-between">
                                                    <span className="text-gray-400">Student: <span className="text-white font-bold">{ride.studentName || "Unknown"}</span></span>
                                                    <span className="text-gray-400">ID: <span className="text-blue-400 font-mono">{ride.studentId?.substring(0, 8).toUpperCase() || "N/A"}</span></span>
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

            {/* Token Group View */}
            <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl flex justify-between items-center shadow-lg">
                <div>
                    <h2 className="text-xl font-bold text-white mb-1">🚖 Pickup Group</h2>
                    <p className="text-gray-400 text-sm">Now Serving (Confirmed)</p>
                </div>
                <div className="text-right">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-1">Currently Serving</p>
                    <p className="text-3xl font-black text-yellow-500">Token {servingToken || "-"}</p>
                </div>
            </div>

            {/* My Active Rides Section */}
            {activeRides.length > 0 && (
                <div className="space-y-4 mb-8">
                    <h2 className="text-xl font-bold text-green-400">My Active Rides 🟢</h2>
                    {activeRides.map((ride) => (
                        <div key={ride.id} className="bg-green-900/10 border border-green-500/30 p-6 rounded-2xl relative overflow-hidden">
                            <div className="flex justify-between items-start mb-4">
                                <span className="bg-green-500 text-black font-bold px-3 py-1 rounded-lg text-sm">Token #{ride.tokenNumber}</span>
                                <span className="text-gray-400 text-xs uppercase font-bold tracking-wider">{ride.rideType}</span>
                            </div>

                            <div className="space-y-2 mb-4">
                                <p className="text-gray-300"><span className="text-gray-500 font-bold mr-2">Pickup:</span>{ride.pickup}</p>
                                <p className="text-gray-300"><span className="text-gray-500 font-bold mr-2">Drop:</span>{ride.drop}</p>
                            </div>

                            <div className="bg-[#111] p-4 rounded-xl flex justify-between items-center">
                                <div>
                                    <p className="text-white font-bold">{ride.studentName}</p>
                                    <p className="text-blue-400 text-sm font-mono">{ride.studentPhone}</p>
                                </div>
                                <a href={`tel:${ride.studentPhone}`} className="bg-green-600 hover:bg-green-500 text-white p-3 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-lg group cursor-pointer hover:cursor-pointer">
                                    <span className="text-xl group-hover:scale-110 transition-transform">📞</span>
                                </a>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex justify-start gap-4 items-center mt-8">
                <h2 className="text-lg font-bold text-white">Incoming Requests ({requests.length})</h2>
                <div className="flex ml-auto gap-4">
                    <button onClick={() => setShowEarnings(true)} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm font-bold shadow-lg shadow-green-500/20 transition-all active:scale-95 flex items-center gap-2">
                        <span>💰</span> Earnings
                    </button>
                    <button onClick={() => setShowEditProfile(true)} className="text-blue-400 hover:text-white text-sm font-semibold underline">
                        Edit Profile
                    </button>
                    <button onClick={() => setShowHistory(true)} className="text-gray-400 hover:text-white text-sm font-semibold underline">
                        History
                    </button>
                </div>
            </div>

            {requests.length === 0 ? (
                <div className="text-center py-12 text-gray-500 bg-gray-900/50 rounded-2xl border border-gray-800/50 border-dashed">
                    <p>No active requests... Take a break! ☕</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {requests
                        .filter(req => !dismissedIds.includes(req.id))
                        .map((req) => (
                            <div key={req.id} className={`bg-[#111] rounded-2xl border ${req.isEmergency ? "border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]" : "border-orange-500/30"} overflow-hidden relative transition-all`}>
                                {/* Emergency Banner */}
                                {req.isEmergency && (
                                    <div className="bg-red-600 text-white text-center text-xs font-bold py-1 animate-pulse">
                                        🚨 EMERGENCY REQUEST: {req.emergencyReason?.toUpperCase()}
                                    </div>
                                )}

                                <div className="p-6 space-y-4">
                                    {/* Token Badge */}
                                    <div>
                                        {req.isEmergency ? (
                                            <span className="inline-flex items-center gap-2 bg-red-900/30 border border-red-500 text-red-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                                                <span>⚡</span>
                                                PRIORITY RIDE
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-2 bg-[#1a140a] border border-orange-500/20 text-orange-500 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                                                <span>🎫</span>
                                                Token #{req.tokenNumber}
                                            </span>
                                        )}
                                    </div>

                                    {/* Pickup & Drop */}
                                    <div className="space-y-3">
                                        <div className="flex items-start gap-3">
                                            <div className="mt-1 text-blue-500">
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                                    <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <div>
                                                <span className="text-gray-400 font-bold mr-2">Pickup:</span>
                                                <span className="text-gray-200 font-medium">{req.pickup}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3">
                                            <div className="mt-1 text-orange-500">
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                                    <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <div>
                                                <span className="text-gray-400 font-bold mr-2">Drop:</span>
                                                <span className="text-gray-200 font-medium">{req.drop}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Meta Info */}
                                    <div className="flex items-center gap-4 text-xs text-gray-500 font-medium pt-2">
                                        <div className="flex items-center gap-1.5">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                                <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75V6z" clipRule="evenodd" />
                                            </svg>
                                            {req.scheduledDate ? `${req.scheduledDate}, ${req.scheduledTime}` : new Date(req.createdAt).toLocaleString()}
                                        </div>
                                        <div className="flex items-center gap-1.5 capitalize">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                                <path d="M4.5 3.75a3 3 0 00-3 3v.75h21v-.75a3 3 0 00-3-3h-15z" />
                                                <path fillRule="evenodd" d="M22.5 9.75h-21v7.5a3 3 0 003 3h15a3 3 0 003-3v-7.5zm-18 3.75a.75.75 0 01.75-.75h6a.75.75 0 010 1.5h-6a.75.75 0 01-.75-.75zm.75 2.25a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5h-1.5z" clipRule="evenodd" />
                                            </svg>
                                            {req.paymentMode}
                                        </div>
                                    </div>
                                </div>

                                {/* Action Button */}
                                <button
                                    onClick={() => handleAccept(req)}
                                    className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 flex items-center justify-center gap-2 transition-colors active:bg-blue-700"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                        <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                                    </svg>
                                    Accept Ride
                                </button>
                                <button
                                    onClick={() => handleReject(req.id)}
                                    className="w-full bg-gray-800 hover:bg-gray-700 text-gray-400 font-bold py-3 flex items-center justify-center gap-2 transition-colors border-t border-gray-700"
                                >
                                    ✕ Reject / Hide
                                </button>
                            </div>
                        ))}
                </div>
            )}

            {/* Edit Profile Modal */}
            {showEditProfile && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
                    <div className="bg-gray-900 w-full max-w-lg rounded-2xl border border-gray-800 p-6 shadow-2xl">
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
                                <label className="block text-sm text-gray-400 mb-1">Vehicle Number</label>
                                <input type="text" className="w-full bg-gray-800 rounded-lg p-3 text-white border border-gray-700"
                                    value={editFormData.vehicleNumber} onChange={e => setEditFormData({ ...editFormData, vehicleNumber: e.target.value })} required />
                            </div>
                            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl mt-6">
                                Save Profile
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
