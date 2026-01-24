"use client";

import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, updateDoc, doc, orderBy, runTransaction } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { subscribeToServingToken } from "@/lib/tokenService";
import { useAuth } from "@/context/AuthContext";

export default function DriverDashboard() {
    const { user } = useAuth();
    const [requests, setRequests] = useState<any[]>([]);
    const [servingToken, setServingToken] = useState<number | null>(null);
    const [showHistory, setShowHistory] = useState(false);
    const [history, setHistory] = useState<any[]>([]);

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
                bookings.push({ id: doc.id, ...doc.data() });
            });
            setRequests(bookings);
        });

        // Listen for Currently Serving (Confirmed) Token
        const tokenUnsub = subscribeToServingToken((token) => {
            setServingToken(token);
        });

        return () => {
            unsubscribe();
            tokenUnsub();
        };
    }, []);

    // Fetch History
    useEffect(() => {
        if (user && showHistory) {
            const q = query(
                collection(db, "bookings"),
                where("driverId", "==", user.uid),
                where("status", "==", "CONFIRMED"), // Show active/confirmed rides in history for now, or COMPLETED if implemented
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
                    driverId: user?.uid || "CURRENT_DRIVER_ID",
                });
            });
        } catch (error) {
            console.error("Error accepting ride", error);
            alert("Failed to accept: " + error);
        }
    };

    return (
        <div className="space-y-6">
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

            <div className="flex justify-between items-end">
                <h2 className="text-lg font-bold text-white mt-8">Incoming Requests ({requests.length})</h2>
                <button
                    onClick={() => setShowHistory(true)}
                    className="text-gray-400 hover:text-white text-sm font-semibold underline"
                >
                    View History
                </button>
            </div>

            {requests.length === 0 ? (
                <div className="text-center py-12 text-gray-500 bg-gray-900/50 rounded-2xl border border-gray-800/50 border-dashed">
                    <p>No active requests... Take a break! ☕</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {requests.map((req) => (
                        <div key={req.id} className="bg-gray-900 p-6 rounded-2xl border border-gray-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:border-gray-700 transition-colors">
                            <div className="flex-1">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="bg-yellow-500 text-black font-black text-lg w-10 h-10 flex items-center justify-center rounded-lg shadow-lg shadow-yellow-500/20">
                                        {req.tokenNumber}
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-white">{req.studentName}</h3>
                                        <div className="text-xs text-gray-500 uppercase">{req.paymentMode} • {req.rideType}</div>
                                    </div>
                                </div>
                                <div className="space-y-2 pl-1">
                                    <div className="flex items-center gap-3 text-sm">
                                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                        <span className="text-gray-300">{req.pickup}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm">
                                        <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                        <span className="text-gray-300">{req.drop}</span>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => handleAccept(req)}
                                className="w-full sm:w-auto bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-8 rounded-xl transition-all shadow-lg active:scale-95"
                            >
                                Accept
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
