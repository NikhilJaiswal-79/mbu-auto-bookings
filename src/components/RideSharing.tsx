"use client";

import { useAuth } from "@/context/AuthContext";
import { useState, useEffect } from "react";
import { collection, addDoc, query, where, onSnapshot, updateDoc, doc, arrayUnion } from "firebase/firestore";
import { db } from "@/lib/firebase";
import dynamic from "next/dynamic";



interface Ride {
    id?: string;
    hostId: string;
    hostName: string;
    origin: string;
    destination: string;
    originCoords?: { lat: number, lng: number } | null;
    destCoords?: { lat: number, lng: number } | null;
    vehicleType: string;
    vehicleNumber: string;
    seatsAvailable: number;
    date: string;
    time: string;
    phoneNumber: string;
    isInstant: boolean;
    status: string;
    participants: { userId: string; name: string; phone: string }[];
    createdAt: string;
    role?: "Host" | "Passenger";
}

interface Suggestion {
    display_name: string;
    lat: string;
    lon: string;
    isSaved?: boolean;
    type?: string;
}

export default function RideSharing() {
    const { user, userProfile } = useAuth();
    const [mode, setMode] = useState<"offer" | "find" | "history">("find");
    const [rides, setRides] = useState<Ride[]>([]);
    const [myHistory, setMyHistory] = useState<Ride[]>([]);
    const [loading, setLoading] = useState(false);

    // Offer Ride Form State
    const [offerForm, setOfferForm] = useState({
        origin: "",
        destination: "",
        vehicleType: "Bike",
        vehicleNumber: userProfile?.vehicleNumber || "",
        seats: 1,
        date: "",
        time: "",
        phoneNumber: userProfile?.phone || "",
        isInstant: false
    });

    // Coordinates State
    const [originCoords, setOriginCoords] = useState<{ lat: number, lng: number } | null>(null);
    const [destCoords, setDestCoords] = useState<{ lat: number, lng: number } | null>(null);

    // Autocomplete State
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [activeField, setActiveField] = useState<"origin" | "destination" | null>(null);

    // Find Ride Filter
    const [searchDest, setSearchDest] = useState("");

    const MapComponent = dynamic(() => import("./MapComponent"), { ssr: false });

    useEffect(() => {
        if (!user) return;

        // 1. Listen for Active Rides (Find Mode)
        const qActive = query(collection(db, "rides"), where("status", "==", "OPEN"));
        const unsubscribeActive = onSnapshot(qActive, (snapshot) => {
            const activeRides: Ride[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data() as Ride;
                // Filter: Not my ride, and has seats
                if (data.hostId !== user.uid && data.seatsAvailable > 0) {
                    activeRides.push({ id: doc.id, ...data });
                }
            });
            setRides(activeRides);
        });

        // 2. Listen for History
        const qAll = query(collection(db, "rides"));
        const unsubscribeHistory = onSnapshot(qAll, (snapshot) => {
            const historydata: Ride[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data() as Ride;
                const amIHost = data.hostId === user.uid;
                const amIParticipant = data.participants?.some((p: any) => p.userId === user.uid);

                if (amIHost || amIParticipant) {
                    historydata.push({ id: doc.id, ...data, role: amIHost ? "Host" : "Passenger" });
                }
            });
            setMyHistory(historydata);
        });

        return () => {
            unsubscribeActive();
            unsubscribeHistory();
        };
    }, [user]);

    // Autocomplete Effect
    useEffect(() => {
        if (!activeField) return;

        const queryText = activeField === "origin" ? offerForm.origin : offerForm.destination;
        const saved = (userProfile?.savedAddresses || []).map((addr: any) => ({
            display_name: addr.address || addr.name, // Handle different schemas
            lat: String(addr.lat || 0),
            lon: String(addr.lng || 0),
            isSaved: true,
            type: addr.type
        }));

        if (!queryText) {
            setSuggestions(saved);
            return;
        }

        // Filter saved addresses
        const savedMatches = saved.filter((s: any) =>
            s.display_name.toLowerCase().includes(queryText.toLowerCase()) ||
            (s.type && s.type.toLowerCase().includes(queryText.toLowerCase()))
        );

        if (queryText.length < 3) {
            setSuggestions(savedMatches);
            return;
        }

        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${queryText}&limit=5`);
                const apiData = await res.json();

                // Merge: Saved + API (Unique)
                const savedMap = new Set(savedMatches.map((s: any) => s.display_name));
                const uniqueApi = apiData.filter((a: any) => !savedMap.has(a.display_name));

                setSuggestions([...savedMatches, ...uniqueApi]);
            } catch (error) {
                console.error("Autocomplete error", error);
                setSuggestions(savedMatches);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [offerForm.origin, offerForm.destination, activeField, userProfile]);

    const handleSelectSuggestion = (suggestion: Suggestion) => {
        const address = suggestion.display_name;
        const lat = parseFloat(suggestion.lat);
        const lon = parseFloat(suggestion.lon);

        if (activeField === "origin") {
            setOfferForm(prev => ({ ...prev, origin: address }));
            setOriginCoords({ lat, lng: lon });
        } else if (activeField === "destination") {
            setOfferForm(prev => ({ ...prev, destination: address }));
            setDestCoords({ lat, lng: lon });
        }
        setSuggestions([]);
        setActiveField(null);
    };

    const handleOfferRide = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        setLoading(true);
        try {
            await addDoc(collection(db, "rides"), {
                hostId: user.uid,
                hostName: userProfile?.name || "Unknown",
                origin: offerForm.origin,
                destination: offerForm.destination,
                originCoords,
                destCoords,
                vehicleType: offerForm.vehicleType,
                vehicleNumber: offerForm.vehicleNumber,
                seatsAvailable: Number(offerForm.seats),
                date: offerForm.isInstant ? new Date().toISOString().split('T')[0] : offerForm.date,
                time: offerForm.isInstant ? new Date().toLocaleTimeString() : offerForm.time,
                phoneNumber: offerForm.phoneNumber,
                isInstant: offerForm.isInstant,
                status: "OPEN",
                participants: [],
                createdAt: new Date().toISOString(),
            });
            alert("Ride Published Successfully!");
            setMode("history"); // Redirect to history
            // Reset form
            setOfferForm({ ...offerForm, origin: "", destination: "", isInstant: false });
            setOriginCoords(null);
            setDestCoords(null);
        } catch (error) {
            console.error("Error offering ride", error);
            alert("Failed to offer ride");
        } finally {
            setLoading(false);
        }
    };

    const handleJoinRide = async (rideId: string, currentSeats: number, hostPhone: string) => {
        if (!user) return;
        if (currentSeats <= 0) {
            alert("Ride is full!");
            return;
        }

        if (!confirm("Confirm Booking? This will share your contact with the host.")) return;

        try {
            await updateDoc(doc(db, "rides", rideId), {
                participants: arrayUnion({
                    userId: user.uid,
                    name: userProfile?.name || "User",
                    phone: userProfile?.phone || ""
                }),
                seatsAvailable: currentSeats - 1
            });
            alert("Ride Join Confirmed! You can now contact the host.");
            setMode("history"); // Auto-redirect to history
        } catch (error) {
            console.error("Error joining ride", error);
            alert("Failed to join ride");
        }
    };

    return (
        <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800 shadow-xl">
            {/* TABS */}
            <div className="flex gap-2 mb-6 bg-gray-800 p-1 rounded-xl">
                {["find", "offer", "history"].map((m) => (
                    <button
                        key={m}
                        onClick={() => setMode(m as any)}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold capitalize transition-all ${mode === m
                            ? "bg-blue-600 text-white shadow-lg"
                            : "text-gray-400 hover:text-white"
                            }`}
                    >
                        {m === "find" ? "🔍 Find Ride" : m === "offer" ? "➕ Offer Ride" : "📜 History"}
                    </button>
                ))}
            </div>

            {/* CONTENT */}
            <div className="animate-fade-in">

                {/* 1. OFFER RIDE FORM */}
                {mode === "offer" && (
                    <form onSubmit={handleOfferRide} className="space-y-4">
                        <div className="flex items-center gap-3 p-3 bg-blue-900/20 border border-blue-500/30 rounded-xl mb-4">
                            <input
                                type="checkbox"
                                id="instant"
                                checked={offerForm.isInstant}
                                onChange={(e) => setOfferForm({ ...offerForm, isInstant: e.target.checked })}
                                className="w-5 h-5 accent-blue-500"
                            />
                            <label htmlFor="instant" className="text-white font-bold cursor-pointer flex-1">
                                ⚡ Instant Ride (Leaving Now)
                            </label>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Origin Input with Suggesions */}
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Origin"
                                    value={offerForm.origin}
                                    onFocus={() => setActiveField("origin")}
                                    onChange={(e) => setOfferForm({ ...offerForm, origin: e.target.value })}
                                    className="w-full bg-gray-800 rounded-lg p-3 text-white border border-gray-700 focus:border-blue-500 outline-none"
                                    required
                                />
                                {activeField === "origin" && suggestions.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 bg-gray-800 border border-gray-700 rounded-lg z-50 mt-1 max-h-40 overflow-y-auto">
                                        {suggestions.map((s: Suggestion, i) => (
                                            <div
                                                key={i}
                                                onClick={() => handleSelectSuggestion(s)}
                                                className="p-3 hover:bg-gray-700 cursor-pointer text-sm text-gray-300 border-b border-gray-700/50 flex items-center gap-2"
                                            >
                                                {s.isSaved && <span className="text-yellow-400 font-bold">{s.type === "Home" ? "🏠" : "⭐"}</span>}
                                                <span>{s.display_name}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Destination Input with Suggestions */}
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Destination"
                                    value={offerForm.destination}
                                    onFocus={() => setActiveField("destination")}
                                    onChange={(e) => setOfferForm({ ...offerForm, destination: e.target.value })}
                                    className="w-full bg-gray-800 rounded-lg p-3 text-white border border-gray-700 focus:border-blue-500 outline-none"
                                    required
                                />
                                {activeField === "destination" && suggestions.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 bg-gray-800 border border-gray-700 rounded-lg z-50 mt-1 max-h-40 overflow-y-auto">
                                        {suggestions.map((s: Suggestion, i) => (
                                            <div
                                                key={i}
                                                onClick={() => handleSelectSuggestion(s)}
                                                className="p-3 hover:bg-gray-700 cursor-pointer text-sm text-gray-300 border-b border-gray-700/50 flex items-center gap-2"
                                            >
                                                {s.isSaved && <span className="text-yellow-400 font-bold">{s.type === "Home" ? "🏠" : "⭐"}</span>}
                                                <span>{s.display_name}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {!offerForm.isInstant && (
                                <>
                                    <input type="date" value={offerForm.date} onChange={(e) => setOfferForm({ ...offerForm, date: e.target.value })} className="bg-gray-800 rounded-lg p-3 text-white border border-gray-700" required />
                                    <input type="time" value={offerForm.time} onChange={(e) => setOfferForm({ ...offerForm, time: e.target.value })} className="bg-gray-800 rounded-lg p-3 text-white border border-gray-700" required />
                                </>
                            )}

                            <select value={offerForm.vehicleType} onChange={(e) => setOfferForm({ ...offerForm, vehicleType: e.target.value })} className="bg-gray-800 rounded-lg p-3 text-white border border-gray-700">
                                <option value="Bike">Bike</option>
                                <option value="Car">Car</option>
                                <option value="Auto">Auto</option>
                            </select>

                            <input type="number" placeholder="Seats" value={offerForm.seats} onChange={(e) => setOfferForm({ ...offerForm, seats: Number(e.target.value) })} className="bg-gray-800 rounded-lg p-3 text-white border border-gray-700" min="1" required />

                            <input type="tel" placeholder="Your Phone Number" value={offerForm.phoneNumber} onChange={(e) => setOfferForm({ ...offerForm, phoneNumber: e.target.value })} className="bg-gray-800 rounded-lg p-3 text-white border border-gray-700 col-span-2" required />
                        </div>

                        {/* Map Preview */}
                        <div className="h-64 rounded-xl overflow-hidden border border-gray-700 shadow-inner relative">
                            <MapComponent pickup={originCoords} drop={destCoords} />
                            {!originCoords && !destCoords && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none z-10">
                                    <p className="text-gray-300 text-sm bg-black/50 px-3 py-1 rounded-full">Select locations to preview route</p>
                                </div>
                            )}
                        </div>

                        <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-900/20 active:scale-95">
                            {loading ? "Publishing..." : "Publish Ride 🚀"}
                        </button>
                    </form>
                )}

                {/* 2. FIND RIDE */}
                {mode === "find" && (
                    <div className="space-y-4">
                        <input type="text" placeholder="Search destination (e.g. MBU, Hostel)..." value={searchDest} onChange={(e) => setSearchDest(e.target.value)} className="w-full bg-gray-800 rounded-lg p-3 text-white mb-4 border border-gray-700 focus:border-purple-500 outline-none" />

                        {rides.filter(r => r.destination.toLowerCase().includes(searchDest.toLowerCase())).map((ride) => (
                            <div key={ride.id} className="bg-gray-800 p-5 rounded-xl border border-gray-700 hover:border-purple-500 transition-all group">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="font-bold text-white text-lg">{ride.destination}</h3>
                                            {ride.isInstant && <span className="bg-yellow-500/20 text-yellow-400 text-xs px-2 py-0.5 rounded font-bold border border-yellow-500/30">⚡ LEAVING NOW</span>}
                                        </div>
                                        <p className="text-gray-400 text-sm mb-2">From: <span className="text-gray-300">{ride.origin}</span></p>
                                        <div className="flex gap-3 text-xs text-gray-500">
                                            <span className="bg-gray-700 px-2 py-1 rounded">📅 {ride.date}</span>
                                            <span className="bg-gray-700 px-2 py-1 rounded">⏰ {ride.time}</span>
                                            <span className="bg-gray-700 px-2 py-1 rounded">🚗 {ride.vehicleType}</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-2xl font-bold text-blue-400">{ride.seatsAvailable}</div>
                                        <div className="text-xs text-gray-500">seats left</div>
                                    </div>
                                </div>

                                <div className="mt-4 pt-4 border-t border-gray-700 flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-purple-900/50 flex items-center justify-center text-purple-400 font-bold">
                                            {ride.hostName[0]}
                                        </div>
                                        <span className="text-sm text-gray-300">{ride.hostName}</span>
                                    </div>
                                    <button onClick={() => ride.id && handleJoinRide(ride.id, ride.seatsAvailable, ride.phoneNumber)} className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg text-sm font-bold shadow-lg shadow-purple-900/20 transition-all hover:scale-105 active:scale-95">
                                        Request Seat
                                    </button>
                                </div>
                            </div>
                        ))}
                        {rides.length === 0 && <div className="text-center py-10 text-gray-500">No active rides found.</div>}
                    </div>
                )}

                {/* 3. HISTORY */}
                {mode === "history" && (
                    <div className="space-y-4">
                        {myHistory.map((ride) => (
                            <div key={ride.id} className="bg-gray-800 p-5 rounded-xl border border-gray-700 relative overflow-hidden">
                                {ride.role === "Host" && <div className="absolute top-0 right-0 bg-blue-600 text-xs px-2 py-1 rounded-bl-lg font-bold">YOU ARE HOST</div>}
                                {ride.role === "Passenger" && <div className="absolute top-0 right-0 bg-green-600 text-xs px-2 py-1 rounded-bl-lg font-bold">JOINED</div>}

                                <h3 className="font-bold text-white text-lg mb-1">{ride.origin} ➝ {ride.destination}</h3>
                                <p className="text-xs text-gray-400 mb-4">{ride.date} at {ride.time}</p>

                                <div className="space-y-3">
                                    {/* Contact Section */}
                                    <div className="bg-gray-900 p-3 rounded-lg border border-gray-700">
                                        <p className="text-xs text-gray-500 uppercase font-bold mb-2">Contact Info</p>
                                        {ride.role === "Passenger" ? (
                                            <div className="flex justify-between items-center">
                                                <div className="text-sm text-white">Host: {ride.hostName}</div>
                                                <div className="text-sm font-mono text-blue-400">📞 {ride.phoneNumber}</div>
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {ride.participants.map((p: any, i: number) => (
                                                    <div key={i} className="flex justify-between items-center text-sm">
                                                        <span className="text-gray-300">{p.name}</span>
                                                        <span className="text-blue-400 font-mono text-xs">📞 {p.phone}</span>
                                                    </div>
                                                ))}
                                                {ride.participants.length === 0 && <p className="text-gray-500 text-sm italic">No passengers yet.</p>}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {myHistory.length === 0 && <div className="text-center py-10 text-gray-500">No history found.</div>}
                    </div>
                )}
            </div>
        </div>
    );
}
