"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, query, where, onSnapshot, updateDoc, doc, orderBy, runTransaction, addDoc, increment } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { subscribeToServingToken } from "@/lib/tokenService";
import { useAuth } from "@/context/AuthContext";
import dynamic from "next/dynamic";

const MapComponent = dynamic(() => import("./MapComponent"), { ssr: false });

export default function DriverDashboard() {
    const { user, userProfile, logout } = useAuth();
    const [requests, setRequests] = useState<any[]>([]);
    const [activeRides, setActiveRides] = useState<any[]>([]);
    const [servingToken, setServingToken] = useState<number | null>(null);
    const [showHistory, setShowHistory] = useState(false);
    const [history, setHistory] = useState<any[]>([]);
    const [dismissedIds, setDismissedIds] = useState<string[]>([]);
    const [showEarnings, setShowEarnings] = useState(false); // New State
    const [viewMode, setViewMode] = useState<"analysis" | "weekly">("analysis");

    // Map State
    const [selectedRideForMap, setSelectedRideForMap] = useState<any>(null);

    // Lost & Found State
    const [lostReports, setLostReports] = useState<any[]>([]);



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
            }, (error) => {
                console.error("Error fetching active rides. Likely missing index:", error);
            });

            // Listen for Lost Items reported by Students for this driver
            const lostQ = query(
                collection(db, "lost_found"),
                where("status", "==", "OPEN"),
                where("userType", "==", "student"), // Reported BY student
                orderBy("createdAt", "desc")
            );

            // Filter logic for lost items linked to this driver
            const lostUnsubscribe = onSnapshot(lostQ, (snapshot) => {
                console.log("🔍 Driver Lost Found Snapshot: ", snapshot.size, " docs found.");
                const reports = snapshot.docs
                    .map(doc => {
                        const data = doc.data();
                        console.log("📄 Doc:", doc.id, "RideDriver:", data.rideDetails?.driverId, "MyID:", user.uid);
                        return { id: doc.id, ...data };
                    })
                    .filter((r: any) => r.rideDetails?.driverId === user.uid);

                console.log("✅ Filtered Reports for Me:", reports.length);
                setLostReports(reports);
            }, (error) => {
                console.error("Error fetching lost items. Likely missing index:", error);
            });

            return () => {
                unsubscribe();
                activeUnsubscribe();
                lostUnsubscribe();
            };
        } else {
            return () => {
                unsubscribe();
                activeUnsubscribe();
            };
        }
    }, [user]);

    // Listen for Currently Serving (Confirmed) Token
    useEffect(() => {
        const tokenUnsub = subscribeToServingToken((token) => {
            setServingToken(token);
        });
        return () => tokenUnsub();
    }, []);

    // Fetch History (Needed for Earnings as well)
    useEffect(() => {
        if (user && (showHistory || showEarnings)) {
            const q = query(
                collection(db, "bookings"),
                where("driverId", "==", user.uid),
                where("status", "in", ["COMPLETED", "CANCELLED", "CONFIRMED"]),
                orderBy("createdAt", "desc")
            );

            const unsubscribe = onSnapshot(q, (snapshot) => {
                setHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            }, (error) => {
                console.error("Error fetching history. Likely missing index:", error);
            });
            return () => unsubscribe();
        }
    }, [user, showHistory, showEarnings]);

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

    // Found Item Logic
    const [showFoundModal, setShowFoundModal] = useState(false);
    const [foundItemName, setFoundItemName] = useState("");
    const [foundItemDesc, setFoundItemDesc] = useState("");

    const handleReportFoundItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !foundItemName) return;

        try {
            await addDoc(collection(db, "lost_found"), {
                userId: user.uid,
                userType: "driver",
                type: "FOUND",
                itemName: foundItemName,
                description: foundItemDesc,
                status: "OPEN",
                createdAt: new Date().toISOString(),
                driverName: userProfile?.name || "Driver",
                contactInfo: userProfile?.phone || user.email
            });
            alert("Report Submitted! Thank you for your honesty. 🌟");
            setShowFoundModal(false);
            setFoundItemName("");
            setFoundItemDesc("");
        } catch (error) {
            console.error("Error reporting found item", error);
            alert("Failed to submit report.");
        }
    };

    // Handle Driver Response to Lost Item
    const handleLostItemResponse = async (reportId: string, found: boolean) => {
        if (!user) return;
        try {
            await updateDoc(doc(db, "lost_found", reportId), {
                status: found ? "FOUND_BY_DRIVER" : "NOT_FOUND_BY_DRIVER",
                driverResponseAt: new Date().toISOString(),
                driverPhone: userProfile?.phone || "Not Provided"
            });

            // Update Driver Reputation
            const driverRef = doc(db, "users", user.uid);

            if (found) {
                // Reward for honesty + finding item
                await updateDoc(driverRef, { reputation: increment(10) });
                alert("Great job! Your reliability has increased. You will receive more ride requests. 🌟");
            } else {
                // Penalty for not finding
                await updateDoc(driverRef, { reputation: increment(-5) });
                alert("Item marked as Not Found. Frequent negative reports may reduce your ride visibility and earnings.");
            }

        } catch (error) {
            console.error("Error updating lost item", error);
            alert("Failed to update status");
        }
    };

    // Seed Fake Data Logic
    const handleSeedData = async () => {
        if (!user) return;
        if (!confirm("⚠️ This will add 30 fake rides to your history for testing. Continue?")) return;

        const modes = ["cash", "credits", "subscription"];
        const locations = ["Main Gate", "Hostel Block A", "Library", "Cafeteria", "Sports Complex", "Admin Block"];

        try {
            const batchPromises = [];
            for (let i = 0; i < 30; i++) {
                // Random day in last 7 days
                const daysAgo = Math.floor(Math.random() * 7);
                const date = new Date();
                date.setDate(date.getDate() - daysAgo);

                // Random hour (mix of peak and off-peak)
                const hour = Math.floor(Math.random() * 14) + 8; // 8 AM to 10 PM
                date.setHours(hour, Math.floor(Math.random() * 60));

                const pickup = locations[Math.floor(Math.random() * locations.length)];
                let drop = locations[Math.floor(Math.random() * locations.length)];
                while (drop === pickup) drop = locations[Math.floor(Math.random() * locations.length)];

                batchPromises.push(addDoc(collection(db, "bookings"), {
                    driverId: user.uid,
                    studentId: "fake-student-id",
                    studentName: "Test Student",
                    pickup,
                    drop,
                    status: "COMPLETED",
                    paymentMode: modes[Math.floor(Math.random() * modes.length)],
                    tokenNumber: 900 + i,
                    createdAt: date.toISOString(),
                    fare: 40
                }));
            }
            await Promise.all(batchPromises);
            alert("✅ Added 30 fake rides! Check Earnings tab now.");
        } catch (error) {
            console.error("Error seeding data:", error);
            alert("Failed to seed data.");
        }
    };

    // Earnings Logic


    // Correct Logic for Mode Counts
    const earnings = useMemo(() => {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const startOfWeek = new Date(now.setDate(now.getDate() - 7)).getTime();

        let todayCash = 0;
        let weekCash = 0;
        let todayRides = { cash: 0, credits: 0, subscription: 0 };
        let hourCounts: { [key: number]: number } = {};
        // Track counts per mode per hour
        let hourModeCounts: { [key: number]: { cash: number, credits: number, subscription: number } } = {};
        // Track stats per route
        let routeCounts: { [key: string]: { count: number, hours: number[] } } = {};
        // Track daily stats (Last 7 Days)
        let dailyStats: { [key: string]: { cash: number, rides: number, date: number } } = {};
        // Init last 7 days
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateKey = d.toDateString();
            dailyStats[dateKey] = { cash: 0, rides: 0, date: d.getTime() };
        }

        history.forEach(ride => {
            const rideDate = new Date(ride.createdAt);
            const dateKey = rideDate.toDateString();

            // Consistent "Today" check using date string match
            const isToday = dateKey === new Date().toDateString();
            const fare = (ride.paymentMode?.toLowerCase() === "cash") ? 40 : 0;

            if (isToday) {
                todayCash += fare;
                const pMode = ride.paymentMode?.toLowerCase() || "unknown";
                if (pMode === "cash") todayRides.cash++;
                else if (pMode.includes("credit")) todayRides.credits++;
                else if (pMode.includes("sub")) todayRides.subscription++;
            }

            // Week Calculation (Last 7 days logic matched with dailyStats init)
            if (dailyStats[dateKey]) {
                weekCash += fare;
                dailyStats[dateKey].cash += fare;
                dailyStats[dateKey].rides++; // Counts ALL rides regardless of mode
            }

            // Hour Logic
            const hour = rideDate.getHours();
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;

            if (!hourModeCounts[hour]) hourModeCounts[hour] = { cash: 0, credits: 0, subscription: 0 };
            const pMode = ride.paymentMode?.toLowerCase() || "";
            if (pMode === "cash") hourModeCounts[hour].cash++;
            else if (pMode.includes("credit")) hourModeCounts[hour].credits++;
            else if (pMode.includes("sub")) hourModeCounts[hour].subscription++;

            // Route Logic
            const routeKey = `${ride.pickup || "Unknown"} → ${ride.drop || "Unknown"}`;
            if (!routeCounts[routeKey]) routeCounts[routeKey] = { count: 0, hours: [] };
            routeCounts[routeKey].count++;
            routeCounts[routeKey].hours.push(hour);
        });

        const peakHour = Object.keys(hourCounts).reduce((a, b) => hourCounts[parseInt(a)] > hourCounts[parseInt(b)] ? a : b, "0");
        const peakCount = hourCounts[parseInt(peakHour)] || 0;

        // Best Day Logic
        const sortedDays = Object.values(dailyStats).sort((a, b) => b.cash - a.cash);
        const bestDay = sortedDays[0];
        const bestDayName = new Date(bestDay.date).toLocaleDateString('en-US', { weekday: 'long' });

        // Convert dailyStats to array for chart and SORT by date
        const weeklyChartData = Object.keys(dailyStats)
            .map(k => ({
                day: new Date(dailyStats[k].date).toLocaleDateString('en-US', { weekday: 'short' }),
                ...dailyStats[k]
            }))
            .sort((a, b) => a.date - b.date);

        // Helper to trim address
        const cleanAddress = (addr: string) => {
            if (!addr) return "Unknown";
            return addr.split(",")[0].trim();
        };

        // Find Top 5 Routes
        const topRoutes = Object.keys(routeCounts)
            .map(key => {
                const data = routeCounts[key];
                const routeHours = data.hours || [];
                const modeHour = routeHours.length > 0
                    ? routeHours.sort((a, b) =>
                        routeHours.filter(v => v === a).length - routeHours.filter(v => v === b).length
                    ).pop() || 0
                    : 0;

                const [pick, drop] = key.split(" → ");
                const cleanKey = `${cleanAddress(pick)} → ${cleanAddress(drop)}`;

                return {
                    fullKey: key,
                    displayKey: cleanKey,
                    count: data.count,
                    modeHour
                };
            })
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        return { todayCash, weekCash, todayRides, peakHour, peakCount, hourCounts, hourModeCounts, topRoutes, weeklyChartData, bestDay, bestDayName };
    }, [history]); // Dependency: history

    // Helper to group hours
    const groupedHours = Array.from({ length: 8 }, (_, i) => {
        const start = i * 3;
        // Sum breakdown for these 3 hours
        let cash = 0, credits = 0, sub = 0;
        for (let h = start; h < start + 3; h++) {
            const data = earnings.hourModeCounts[h];
            if (data) {
                cash += data.cash;
                credits += data.credits;
                sub += data.subscription;
            }
        }
        return { cash, credits, sub, label: `${start}-${start + 3}` };
    });

    return (
        <div className="space-y-6">
            {/* Header with Nav Buttons */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-900/50 p-6 rounded-3xl border border-white/5 backdrop-blur-md">
                <div>
                    <h1 className="text-3xl font-black text-white flex items-center gap-3">
                        <span className="text-4xl">🛺</span> Driver Dashboard
                    </h1>
                    <p className="text-gray-400 text-sm mt-1 ml-1">Welcome back, <span className="text-white font-bold">{userProfile?.name}</span></p>
                </div>

                <div className="flex items-center gap-3">
                    <button onClick={() => setShowEarnings(true)} className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white px-6 py-3 rounded-2xl text-sm font-bold shadow-lg shadow-green-900/20 transition-all active:scale-95 flex items-center gap-2">
                        <span className="text-xl">💰</span> <span className="uppercase tracking-wide">Earnings</span>
                    </button>
                    <button onClick={() => setShowEditProfile(true)} className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-3 rounded-2xl text-sm font-bold transition-all border border-gray-700">
                        Edit Profile
                    </button>
                    <button onClick={handleSeedData} className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-3 rounded-2xl text-sm font-bold transition-all border border-purple-500/50 shadow-lg shadow-purple-900/20">
                        🛠️ Seed Data
                    </button>
                    <button onClick={() => setShowHistory(true)} className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-3 rounded-2xl text-sm font-bold transition-all border border-gray-700">
                        History
                    </button>
                </div>
            </div>
            {/* Earnings Modal */}
            {showEarnings && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-fade-in">
                    <div className="bg-gray-950/80 w-full max-w-4xl rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/5 backdrop-blur-md sticky top-0 z-10">
                            <div>
                                <h2 className="text-3xl font-black text-white">Earnings & Insights 💰</h2>
                                <p className="text-gray-400 text-sm mt-1">Detailed performance analytics</p>
                            </div>
                            <button onClick={() => setShowEarnings(false)} className="w-10 h-10 rounded-full bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-white transition-colors">✕</button>
                        </div>

                        {/* View Tabs */}
                        <div className="flex border-b border-gray-800">
                            <button
                                onClick={() => setViewMode("analysis")}
                                className={`flex-1 py-3 text-sm font-bold transition-colors ${viewMode === "analysis" ? "text-green-400 border-b-2 border-green-400 bg-green-400/5" : "text-gray-400 hover:text-white"}`}
                            >
                                Daily Analysis
                            </button>
                            <button
                                onClick={() => setViewMode("weekly")}
                                className={`flex-1 py-3 text-sm font-bold transition-colors ${viewMode === "weekly" ? "text-blue-400 border-b-2 border-blue-400 bg-blue-400/5" : "text-gray-400 hover:text-white"}`}
                            >
                                Weekly Trends 📈
                            </button>
                        </div>

                        <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
                            {viewMode === "analysis" ? (
                                <div className="space-y-6 animate-fade-in">
                                    {/* Today's Summary */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="bg-gradient-to-br from-green-900 to-green-800 p-6 rounded-2xl border border-green-500/30 relative overflow-hidden">
                                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                                <span className="text-8xl">₹</span>
                                            </div>
                                            <p className="text-green-200 font-bold uppercase tracking-wider text-xs mb-1">Today's Cash Earned</p>
                                            <h3 className="text-4xl font-black text-white">₹{earnings.todayCash}</h3>
                                            <p className="text-xs text-green-300 mt-2">Does not include subscription/credits</p>
                                        </div>
                                        <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
                                            <p className="text-gray-400 font-bold uppercase tracking-wider text-xs mb-3">Today's Rides Breakdown</p>
                                            <div className="flex flex-col items-center justify-center">
                                                {/* PIE CHART */}
                                                <div className="relative w-40 h-40 rounded-full shadow-lg mb-4 flex items-center justify-center"
                                                    style={{
                                                        background: `conic-gradient(
                                                    #22c55e 0% ${(earnings.todayRides.cash / (earnings.todayRides.cash + earnings.todayRides.credits + earnings.todayRides.subscription || 1)) * 100}%,
                                                    #eab308 ${(earnings.todayRides.cash / (earnings.todayRides.cash + earnings.todayRides.credits + earnings.todayRides.subscription || 1)) * 100}% ${(earnings.todayRides.cash + earnings.todayRides.credits) / (earnings.todayRides.cash + earnings.todayRides.credits + earnings.todayRides.subscription || 1) * 100}%,
                                                    #3b82f6 ${(earnings.todayRides.cash + earnings.todayRides.credits) / (earnings.todayRides.cash + earnings.todayRides.credits + earnings.todayRides.subscription || 1) * 100}% 100%
                                                )`
                                                    }}
                                                >
                                                    <div className="w-28 h-28 bg-[#1f2937] rounded-full flex flex-col items-center justify-center">
                                                        <span className="text-2xl font-bold text-white">
                                                            {earnings.todayRides.cash + earnings.todayRides.credits + earnings.todayRides.subscription}
                                                        </span>
                                                        <span className="text-[10px] text-gray-400 uppercase">Total Rides</span>
                                                    </div>
                                                </div>

                                                {/* Legend */}
                                                <div className="w-full space-y-2">
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="flex items-center gap-2 text-gray-300"><div className="w-3 h-3 bg-green-500 rounded-full"></div> Cash</span>
                                                        <span className="font-bold text-white">{earnings.todayRides.cash}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="flex items-center gap-2 text-gray-300"><div className="w-3 h-3 bg-yellow-500 rounded-full"></div> Credits</span>
                                                        <span className="font-bold text-white">{earnings.todayRides.credits}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="flex items-center gap-2 text-gray-300"><div className="w-3 h-3 bg-blue-500 rounded-full"></div> Pass</span>
                                                        <span className="font-bold text-white">{earnings.todayRides.subscription}</span>
                                                    </div>
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
                                        <div className="text-right bg-orange-900/20 border border-orange-500/50 p-3 rounded-xl flex items-center gap-3">
                                            <div className="bg-orange-500/20 p-2 rounded-lg">
                                                <span className="text-2xl">🌅</span>
                                            </div>
                                            <div>
                                                <p className="text-orange-400 text-[10px] font-bold uppercase tracking-wider">Golden Hour</p>
                                                <p className="text-xl font-black text-white">{earnings.peakHour}:00 - {parseInt(earnings.peakHour) + 1}:00</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Peak Hours Chart */}
                                    <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 relative">
                                        <h3 className="text-white font-bold mb-6 flex items-center gap-2">
                                            <span>📊</span> Peak Traffic Hours (Ride Count)
                                        </h3>
                                        {/* Legend */}
                                        <div className="absolute top-6 right-6 flex items-center gap-3 text-[10px]">
                                            <div className="flex items-center gap-1"><div className="w-2 h-2 bg-green-500 rounded-full"></div> Cash</div>
                                            <div className="flex items-center gap-1"><div className="w-2 h-2 bg-yellow-500 rounded-full"></div> Credits</div>
                                            <div className="flex items-center gap-1"><div className="w-2 h-2 bg-blue-500 rounded-full"></div> Pass</div>
                                        </div>
                                        <div className="h-48 flex items-end justify-between gap-2 overflow-x-auto pb-2 custom-scrollbar">
                                            {groupedHours.map((group, i) => {
                                                // Find absolute max across all categories to scale
                                                const globalMax = Math.max(
                                                    ...groupedHours.map(g => Math.max(g.cash, g.credits, g.sub)),
                                                    1
                                                );

                                                const hCash = (group.cash / globalMax) * 100;
                                                const hCred = (group.credits / globalMax) * 100;
                                                const hSub = (group.sub / globalMax) * 100;

                                                return (
                                                    <div key={i} className="min-w-[60px] flex-1 flex flex-col items-center gap-1 group justify-end h-full">
                                                        <div className="flex items-end gap-1 h-32 w-full justify-center">
                                                            {/* Cash Bar */}
                                                            <div className="w-2 bg-green-500 rounded-t relative group-hover:bg-green-400 transition-all" style={{ height: `${hCash || 5}%` }}></div>
                                                            {/* Credits Bar */}
                                                            <div className="w-2 bg-yellow-500 rounded-t relative group-hover:bg-yellow-400 transition-all" style={{ height: `${hCred || 5}%` }}></div>
                                                            {/* Pass Bar */}
                                                            <div className="w-2 bg-blue-500 rounded-t relative group-hover:bg-blue-400 transition-all" style={{ height: `${hSub || 5}%` }}></div>
                                                        </div>

                                                        <span className="text-[10px] text-gray-500 font-mono tracking-tighter mt-1">{group.label}</span>

                                                        {/* Tooltip on Hover */}
                                                        <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-700 p-2 rounded shadow-xl z-20 hidden group-hover:block w-max text-[10px]">
                                                            <div className="text-green-400 font-bold">Cash: {group.cash} Rides</div>
                                                            <div className="text-yellow-400 font-bold">Credits: {group.credits} Rides</div>
                                                            <div className="text-blue-400 font-bold">Pass: {group.sub} Rides</div>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>

                                    {/* Smart Insights Card */}
                                    <div className="bg-gradient-to-r from-indigo-900 to-purple-900 p-6 rounded-2xl border border-indigo-500/30">
                                        <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                                            <span>🧠</span> Smart Insights
                                        </h3>
                                        <div className="space-y-4">
                                            <div className="flex items-start gap-3">
                                                <div className="bg-white/10 p-2 rounded-lg text-xl">⏰</div>
                                                <div>
                                                    <p className="text-indigo-200 text-xs uppercase font-bold">Best Time to Drive</p>
                                                    <p className="text-white font-bold text-lg">
                                                        {parseInt(earnings.peakHour) === 0 && earnings.peakCount === 0 ? "Not enough data" :
                                                            `${earnings.peakHour}:00 - ${parseInt(earnings.peakHour) + 1}:00`}
                                                    </p>
                                                    {earnings.peakCount > 0 && <p className="text-white/60 text-xs">Peak demand of {earnings.peakCount} rides</p>}
                                                </div>
                                            </div>

                                            <div className="flex items-start gap-3">
                                                <div className="bg-white/10 p-2 rounded-lg text-xl">📍</div>
                                                <div className="w-full">
                                                    <p className="text-indigo-200 text-xs uppercase font-bold mb-2">Top 5 Busiest Routes</p>
                                                    {earnings.topRoutes.length === 0 ? (
                                                        <p className="text-white font-bold text-lg">No data yet</p>
                                                    ) : (
                                                        <ul className="space-y-3">
                                                            {earnings.topRoutes.map((route, idx) => (
                                                                <li key={idx} className="flex justify-between items-center text-sm border-b border-indigo-500/20 pb-2 last:border-0 last:pb-0">
                                                                    <div>
                                                                        <span className="text-white font-bold block">{idx + 1}. {route.displayKey}</span>
                                                                        <span className="text-indigo-300 text-xs">Usually around {route.modeHour}:00</span>
                                                                    </div>
                                                                    <div className="bg-black/30 px-2 py-1 rounded text-white font-mono text-xs">
                                                                        {route.count} Rides
                                                                    </div>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                            ) : (
                                <div className="space-y-6 animate-fade-in">
                                    {/* Weekly Summary Cards */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-gray-800 p-4 rounded-xl border border-gray-700">
                                            <p className="text-gray-400 text-xs font-bold uppercase mb-1">Weekly Earnings</p>
                                            <p className="text-2xl font-black text-white">₹{earnings.weekCash}</p>
                                        </div>
                                        <div className="bg-gradient-to-br from-blue-900 to-blue-800 p-4 rounded-xl border border-blue-500/30">
                                            <p className="text-blue-200 text-xs font-bold uppercase mb-1">Best Day</p>
                                            <p className="text-xl font-black text-white">{earnings.bestDayName}</p>
                                            <p className="text-xs text-blue-300">₹{earnings.bestDay.cash} earned</p>
                                        </div>
                                    </div>

                                    {/* SVG Line Chart */}


                                    {/* Pie Chart: Weekly Rides Distribution */}
                                    <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
                                        <h3 className="text-white font-bold mb-6">📊 Weekly Rides Distribution</h3>
                                        <div className="flex flex-col md:flex-row items-center gap-8">
                                            {/* Chart */}
                                            <div className="relative w-48 h-48">
                                                <svg viewBox="-1 -1 2 2" className="transform -rotate-90 w-full h-full">
                                                    {(() => {
                                                        const total = earnings.weeklyChartData.reduce((acc, d) => acc + d.rides, 0);
                                                        let accumulatedPercent = 0;

                                                        if (total === 0) return (
                                                            <circle cx="0" cy="0" r="1" fill="#374151" />
                                                        );

                                                        return earnings.weeklyChartData.map((d, i) => {
                                                            if (d.rides === 0) return null;
                                                            const percent = d.rides / total;
                                                            const startPercent = accumulatedPercent;
                                                            accumulatedPercent += percent;

                                                            const startX = Math.cos(2 * Math.PI * startPercent);
                                                            const startY = Math.sin(2 * Math.PI * startPercent);
                                                            const endX = Math.cos(2 * Math.PI * accumulatedPercent);
                                                            const endY = Math.sin(2 * Math.PI * accumulatedPercent);

                                                            const largeArcFlag = percent > 0.5 ? 1 : 0;

                                                            // Colors array (Distinct/Unique)
                                                            const colors = ["#ef4444", "#3b82f6", "#10b981", "#eab308", "#a855f7", "#ec4899", "#06b6d4"];
                                                            const color = colors[i % colors.length];

                                                            return (
                                                                <path
                                                                    key={i}
                                                                    d={`M 0 0 L ${startX} ${startY} A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY} Z`}
                                                                    fill={color}
                                                                    className="hover:opacity-80 transition-opacity cursor-pointer"
                                                                />
                                                            );
                                                        });
                                                    })()}
                                                </svg>
                                                {/* Donut Hole (Optional) */}
                                                <div className="absolute inset-0 m-auto w-24 h-24 bg-gray-800 rounded-full flex items-center justify-center">
                                                    <div className="text-center">
                                                        <div className="text-xs text-gray-500">Total</div>
                                                        <div className="text-2xl font-bold text-white">{earnings.weeklyChartData.reduce((acc, d) => acc + d.rides, 0)}</div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Legend */}
                                            <div className="flex-1 grid grid-cols-2 gap-3">
                                                {earnings.weeklyChartData.map((d, i) => {
                                                    const colors = ["#ef4444", "#3b82f6", "#10b981", "#eab308", "#a855f7", "#ec4899", "#06b6d4"];
                                                    const color = colors[i % colors.length];
                                                    return (
                                                        <div key={i} className="flex items-center gap-2 text-xs">
                                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }}></div>
                                                            <span className="text-gray-300 w-8">{d.day}</span>
                                                            <span className="text-white font-bold">{d.rides} Rides</span>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Consistency Badge */}
                                    <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-800 flex items-center gap-4">
                                        <div className="bg-yellow-500/20 p-2 rounded-lg text-2xl">🔥</div>
                                        <div>
                                            <p className="text-white font-bold text-sm">You've been active {earnings.weeklyChartData.filter(d => d.rides > 0).length} days this week!</p>
                                            <p className="text-gray-500 text-xs">Keep it up to maximize earnings.</p>
                                        </div>
                                    </div>
                                </div>
                            )}
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
                </div >
            )
            }



            {/* My Active Rides Section */}
            {
                activeRides.length > 0 && (
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
                                    <button
                                        onClick={() => setSelectedRideForMap(ride)}
                                        className="text-xs bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white px-3 py-1.5 rounded-lg border border-blue-500/30 transition-all font-bold flex items-center gap-1 w-fit mt-2"
                                    >
                                        <span>📍</span> View Route
                                    </button>
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
                )
            }
            {/* LOST ITEM ALERTS */}
            {
                lostReports.length > 0 && (
                    <div className="space-y-4 mb-8 animate-fade-in">
                        <div className="bg-red-900/20 border border-red-500/50 p-6 rounded-2xl relative overflow-hidden shadow-[0_0_30px_rgba(220,38,38,0.2)]">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="bg-red-500 text-white p-2 rounded-lg animate-pulse">
                                    🚨
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-red-500 uppercase tracking-wide">Lost Item Reported!</h2>
                                    <p className="text-red-300 text-sm">A student left something in your auto.</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                {lostReports.map((report) => (
                                    <div key={report.id} className="bg-black/40 rounded-xl p-4 border border-red-500/30 backdrop-blur-sm">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-white font-bold text-lg">{report.itemName}</span>
                                            <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded uppercase">
                                                {report.status}
                                            </span>
                                        </div>
                                        <p className="text-gray-300 text-sm mb-3">"{report.description}"</p>

                                        <div className="flex items-center gap-2 mb-4 text-xs text-gray-400">
                                            <span>👤 {report.studentName || "Student"}</span>
                                            <span>•</span>
                                            <span>📞 {report.contactInfo}</span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                onClick={() => handleLostItemResponse(report.id, false)}
                                                className="bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-lg font-bold text-sm transition-colors"
                                            >
                                                ❌ Not Found
                                            </button>
                                            <button
                                                onClick={() => handleLostItemResponse(report.id, true)}
                                                className="bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg font-bold text-sm transition-colors shadow-lg shadow-green-900/50"
                                            >
                                                ✅ I Found It
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )
            }

            <div className="flex justify-start gap-4 items-center mt-8">
                <h2 className="text-lg font-bold text-white">Incoming Requests ({requests.length})</h2>
            </div>

            {/* Live Requests Section */}
            <h2 className="text-lg font-bold text-white mb-4 mt-8 flex items-center justify-between">
                <span>Live Requests ⚡</span>
            </h2>

            {/* Low Reputation Warning - Only show if there are OPEN lost item reports */}
            {
                (userProfile?.reputation ?? 100) < 50 && lostReports.length > 0 && (
                    <div className="bg-orange-500/10 border border-orange-500/50 p-3 rounded-lg flex items-center gap-3 mb-4 animate-pulse">
                        <span className="text-xl">⚠️</span>
                        <p className="text-orange-300 text-sm">
                            <b>Performance Alert:</b> Your account visibility is reduced due to recent activity.
                            {(userProfile?.reputation ?? 100) < 30 ? " High-value scheduled rides are hidden." : ""}
                            <br />Ensure lost items are returned to restore your earnings potential.
                        </p>
                    </div>
                )
            }

            {
                (() => {
                    // Reputation filtering logic
                    const reputation = userProfile?.reputation ?? 100;
                    let filteredRequests = requests.filter(r => !dismissedIds.includes(r.id));

                    // Penalty 1: Hide Scheduled Rides if below 30
                    if (reputation < 30) {
                        filteredRequests = filteredRequests.filter(r => r.rideType !== "scheduled");
                    } else {
                        filteredRequests = filteredRequests.filter(r => r.rideType !== "scheduled");
                    }

                    // Penalty 2: Limit visibility if below 50
                    if (reputation < 50) {
                        filteredRequests = filteredRequests.slice(0, 1);
                    }

                    if (filteredRequests.length === 0) {
                        return (
                            <p className="text-gray-500 text-sm">No live requests.</p>
                        );
                    }

                    return (
                        <div className="space-y-4">
                            {filteredRequests.map((req) => (
                                <div key={req.id} className={`bg-[#111] rounded-2xl border ${req.isEmergency ? "border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]" : "border-orange-500/30"} overflow-hidden relative transition-all`}>
                                    {req.isEmergency && (
                                        <div className="bg-red-600 text-white text-center text-xs font-bold py-1 animate-pulse">
                                            🚨 EMERGENCY REQUEST: {req.emergencyReason?.toUpperCase()}
                                        </div>
                                    )}

                                    <div className="p-6 space-y-4">
                                        <div>
                                            {req.isEmergency ? (
                                                <span className="inline-flex items-center gap-2 bg-red-900/30 border border-red-500 text-red-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                                                    <span>⚡</span> PRIORITY RIDE
                                                </span>
                                            ) : req.isGroupRide ? (
                                                <span className="inline-flex items-center gap-2 bg-purple-900/30 border border-purple-500 text-purple-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                                                    <span>👥</span> Group Ride ({req.passengers?.length || "Team"})
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-2 bg-[#1a140a] border border-orange-500/20 text-orange-500 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                                                    <span>🎫</span> Token #{req.tokenNumber}
                                                </span>
                                            )}
                                        </div>

                                        <div className="space-y-3">
                                            {req.isGroupRide && req.waypoints && req.waypoints.length > 0 ? (
                                                <div className="space-y-2">
                                                    <div className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">Route & Stops</div>
                                                    {req.waypoints.map((wp: any, idx: number) => (
                                                        <div key={idx} className="flex items-start gap-2 text-sm">
                                                            <span className="text-purple-500 font-bold">{idx + 1}.</span>
                                                            <div className="flex-1">
                                                                <span className="text-gray-300">{wp.address}</span>
                                                                {wp.label && <span className="text-gray-500 text-xs ml-2">({wp.label})</span>}
                                                            </div>
                                                        </div>
                                                    ))}
                                                    <div className="flex items-start gap-2 text-sm mt-2 pt-2 border-t border-gray-800">
                                                        <span className="text-orange-500 font-bold">🏁</span>
                                                        <span className="text-gray-200 font-bold">{req.drop}</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex items-start gap-3">
                                                        <div className="mt-1 text-blue-500">📍</div>
                                                        <div><span className="text-gray-400 font-bold mr-2">Pickup:</span><span className="text-gray-200 font-medium">{req.pickup}</span></div>
                                                    </div>
                                                    <div className="flex items-start gap-3">
                                                        <div className="mt-1 text-orange-500">🏁</div>
                                                        <div><span className="text-gray-400 font-bold mr-2">Drop:</span><span className="text-gray-200 font-medium">{req.drop}</span></div>
                                                    </div>
                                                </>
                                            )}

                                            <button
                                                onClick={() => setSelectedRideForMap(req)}
                                                className="text-xs bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white px-3 py-1.5 rounded-lg border border-gray-700 transition-all font-bold flex items-center gap-1 w-fit"
                                            >
                                                <span>🗺️</span> Check Map
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-4 text-xs text-gray-500 font-medium pt-2">
                                            <div className="flex items-center gap-1.5"><span className="text-lg">🕒</span> {new Date(req.createdAt).toLocaleTimeString()}</div>
                                            <div className="flex items-center gap-1.5 capitalize"><span className="text-lg">💳</span> {req.paymentMode}</div>
                                        </div>
                                    </div>
                                    <div className="flex">
                                        <button onClick={() => handleReject(req.id)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-400 font-bold py-3 border-t border-gray-700">✕ Dismiss</button>
                                        <button onClick={() => handleAccept(req)} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 border-t border-blue-500">Accept</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    );
                })()
            }

            {/* Scheduled / Timetable Section */}
            <h2 className="text-lg font-bold text-yellow-400 mb-4 mt-8 flex items-center gap-2"><span>📅</span> Scheduled & Timetable Rides</h2>
            {
                requests.filter(r => r.rideType === "scheduled" && !dismissedIds.includes(r.id)).length === 0 ? (
                    <p className="text-gray-500 text-sm">No scheduled rides.</p>
                ) : (
                    <div className="space-y-4">
                        {requests
                            .filter(req => req.rideType === "scheduled" && !dismissedIds.includes(req.id))
                            .map((req) => (
                                <div key={req.id} className="bg-yellow-900/10 rounded-2xl border border-yellow-500/30 overflow-hidden relative transition-all">
                                    <div className="p-6 space-y-4">
                                        <div>
                                            <div className="flex gap-2">
                                                <span className="inline-flex items-center gap-2 bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider animate-pulse">
                                                    <span>📅</span> SCHEDULED
                                                </span>
                                                {req.isGroupRide && (
                                                    <span className="inline-flex items-center gap-2 bg-purple-900/30 border border-purple-500 text-purple-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                                                        <span>👥</span> Group Ride ({req.passengers?.length || "Team"})
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            {req.isGroupRide && req.waypoints && req.waypoints.length > 0 ? (
                                                <div className="space-y-2">
                                                    <div className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">Route & Stops</div>
                                                    {req.waypoints.map((wp: any, idx: number) => (
                                                        <div key={idx} className="flex items-start gap-2 text-sm">
                                                            <span className="text-purple-500 font-bold">{idx + 1}.</span>
                                                            <div className="flex-1">
                                                                <span className="text-gray-300">{wp.address}</span>
                                                                {wp.label && <span className="text-gray-500 text-xs ml-2">({wp.label})</span>}
                                                            </div>
                                                        </div>
                                                    ))}
                                                    <div className="flex items-start gap-2 text-sm mt-2 pt-2 border-t border-gray-800">
                                                        <span className="text-orange-500 font-bold">🏁</span>
                                                        <span className="text-gray-200 font-bold">{req.drop}</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex items-start gap-3">
                                                        <div className="mt-1 text-blue-500">📍</div>
                                                        <div><span className="text-gray-400 font-bold mr-2">Pickup:</span><span className="text-gray-200 font-medium">{req.pickup}</span></div>
                                                    </div>
                                                    <div className="flex items-start gap-3">
                                                        <div className="mt-1 text-orange-500">🏁</div>
                                                        <div><span className="text-gray-400 font-bold mr-2">Drop:</span><span className="text-gray-200 font-medium">{req.drop}</span></div>
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        {/* Map Button for Scheduled Rides */}
                                        <button
                                            onClick={() => setSelectedRideForMap(req)}
                                            className="text-xs bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white px-3 py-1.5 rounded-lg border border-gray-700 transition-all font-bold flex items-center gap-1 w-fit"
                                        >
                                            <span>🗺️</span> Check Map
                                        </button>

                                        <div className="flex items-center gap-4 pt-2">
                                            {/* Large Time Display */}
                                            <div className="bg-black/50 px-3 py-2 rounded-lg border border-yellow-500/20">
                                                <p className="text-xs text-gray-400 uppercase font-bold">Time</p>
                                                <p className="text-yellow-400 font-black text-xl">{req.scheduledTime || "N/A"}</p>
                                            </div>
                                            <div className="bg-black/50 px-3 py-2 rounded-lg border border-gray-700">
                                                <p className="text-xs text-gray-400 uppercase font-bold">Date</p>
                                                <p className="text-white font-bold">{req.scheduledDate}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex">
                                        <button onClick={() => handleReject(req.id)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-400 font-bold py-3 border-t border-gray-700">✕ Dismiss</button>
                                        <button onClick={() => handleAccept(req)} className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-black font-bold py-3 border-t border-yellow-500">Accept Schedule</button>
                                    </div>
                                </div>
                            ))}
                    </div>
                )
            }


            {/* Edit Profile Modal */}
            {
                showEditProfile && (
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
                )
            }
            {/* Map Modal */}
            {
                selectedRideForMap && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
                        <div className="bg-gray-900 w-full max-w-2xl h-[70vh] rounded-2xl border border-gray-800 shadow-2xl relative flex flex-col overflow-hidden">
                            <button
                                onClick={() => setSelectedRideForMap(null)}
                                className="absolute top-4 right-4 z-[1000] bg-black/50 text-white w-10 h-10 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors backdrop-blur-md"
                            >
                                ✕
                            </button>
                            <div className="flex-1 relative z-0">
                                <MapComponent
                                    pickup={selectedRideForMap.pickupCoords}
                                    drop={selectedRideForMap.dropCoords}
                                    waypoints={selectedRideForMap.waypoints}
                                />
                            </div>
                            <div className="p-4 bg-gray-900 border-t border-gray-800 text-center">
                                <p className="text-white font-bold">{selectedRideForMap.pickup} ➔ {selectedRideForMap.drop}</p>
                                {!selectedRideForMap.pickupCoords && (
                                    <p className="text-yellow-500 text-xs mt-1">⚠️ No GPS data available for this ride. Showing approximate location.</p>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
