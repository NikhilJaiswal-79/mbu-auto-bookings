"use client";

import { useEffect, useState } from "react";
import { extractTimetable, extractHolidays } from "@/lib/gemini";
import { checkAndTriggerAutoBooking, resetDailyLog } from "@/lib/bookingAgent"; // New Agent
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, getDocs, collection, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

export default function AutomatedBooking() {
    const [activeTab, setActiveTab] = useState<"timetable" | "holidays" | "leaves" | "settings" | "team">("timetable");
    const { user, userProfile } = useAuth();

    // Timetable State
    const [timetable, setTimetable] = useState<any>(null);
    const [isExtracting, setIsExtracting] = useState(false);

    // Holidays State
    const [holidays, setHolidays] = useState<any[]>([]);

    // Leaves State
    const [leaveDate, setLeaveDate] = useState("");
    const [leaveReason, setLeaveReason] = useState("");
    const [leaves, setLeaves] = useState<any[]>([]);

    useEffect(() => {
        // Fetch existing data
        if (user) {
            getDoc(doc(db, "users", user.uid)).then(d => {
                if (d.exists()) {
                    const data = d.data();
                    if (data.timetable) setTimetable(data.timetable);
                    if (data.holidays) setHolidays(data.holidays);
                    if (data.leaves) setLeaves(data.leaves);
                }
            });
        }
    }, [user]);

    const handleTimetableUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsExtracting(true);
        try {
            const extractedData = await extractTimetable(file);
            setTimetable(extractedData);

            // Save to Firestore
            if (user) {
                await updateDoc(doc(db, "users", user.uid), { timetable: extractedData });
            }
            alert("Timetable Extracted & Saved!");
        } catch (error) {
            console.error(error);
            alert("Failed to extract timetable.");
        } finally {
            setIsExtracting(false);
        }
    };

    const handleHolidayUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsExtracting(true);
        try {
            const extractedHolidays = await extractHolidays(file);
            setHolidays(extractedHolidays);

            // Save to Firestore
            if (user) {
                await updateDoc(doc(db, "users", user.uid), { holidays: extractedHolidays });
            }
            alert(`Found ${extractedHolidays.length} holidays! Calendar updated.`);
        } catch (error) {
            console.error(error);
            alert("Failed to extract holidays.");
        } finally {
            setIsExtracting(false);
        }
    };

    const handleAddLeave = async () => {
        if (!leaveDate || !user) return;
        const newLeave = { date: leaveDate, reason: leaveReason, id: Date.now() };

        try {
            await updateDoc(doc(db, "users", user.uid), {
                leaves: arrayUnion(newLeave)
            });
            setLeaves(prev => [...prev, newLeave]);
            setLeaveDate("");
            setLeaveReason("");
        } catch (e) {
            console.error(e);
        }
    };

    const handleDeleteLeave = async (leave: any) => {
        if (!user) return;
        try {
            await updateDoc(doc(db, "users", user.uid), {
                leaves: arrayRemove(leave)
            });
            setLeaves(prev => prev.filter(l => l.id !== leave.id));
        } catch (e) { console.error(e); }
    };

    const handleTestAgent = async () => {
        if (!user) return;
        const result = await checkAndTriggerAutoBooking(user, true);
        if (result?.success) {
            alert("✅ Agent Success: " + result.message);
        } else if (result?.skipped) {
            alert("ℹ️ Agent Skipped: " + result.reason);
        } else if (result?.error) {
            alert("❌ Agent Error: " + result.error);
        }
    };

    const handleResetAgent = async () => {
        if (!user) return;
        const result = await resetDailyLog(user);
        if (result?.success) {
            alert("🧹 Memory Cleared! You can force run again.");
        } else {
            alert("Error clearing memory.");
        }
    };

    // Team Logic
    const [team, setTeam] = useState<any[]>([]);
    const [friendPhone, setFriendPhone] = useState("");
    const [searchingFriend, setSearchingFriend] = useState(false);

    useEffect(() => {
        if (userProfile && (userProfile as any).timetable?.team) {
            setTeam((userProfile as any).timetable.team);
        }
    }, [userProfile]);

    const handleAddFriend = async () => {
        if (!friendPhone || !user) return;
        if (team.length >= 6) { // 6 because including self? No, usually friends list is friends. User said "upto a limit of 6". Let's say 5 friends + self.
            alert("Team full! Max 5 friends.");
            return;
        }
        setSearchingFriend(true);
        try {
            const q = query(collection(db, "users"), where("phone", "==", friendPhone));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                alert("User not found with this phone number.");
                return;
            }

            const friendDoc = querySnapshot.docs[0];
            const friendData = friendDoc.data();

            // Check if already in team
            if (team.some(m => m.uid === friendDoc.id)) {
                alert("Friend already in team!");
                return;
            }

            if (friendDoc.id === user.uid) {
                alert("You cannot add yourself!");
                return;
            }

            const newMember = {
                uid: friendDoc.id,
                name: friendData.name || "Unknown",
                phone: friendData.phone || friendPhone,
                pickup: friendData.savedAddresses?.[0]?.address || "Home", // Default to first saved address
                lat: friendData.savedAddresses?.[0]?.lat || 0,
                lng: friendData.savedAddresses?.[0]?.lng || 0
            };

            const newTeam = [...team, newMember];
            setTeam(newTeam);

            // Save to Firestore
            await updateDoc(doc(db, "users", user.uid), {
                "timetable.team": newTeam
            });

            setFriendPhone("");
            alert(`${newMember.name} added to team!`);

        } catch (e: any) {
            console.error(e);
            alert("Error adding friend: " + e.message);
        } finally {
            setSearchingFriend(false);
        }
    };


    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-900 to-indigo-900 p-8 rounded-3xl text-center shadow-2xl border border-blue-800 relative overflow-hidden">
                <div className="relative z-10">
                    <h2 className="text-3xl font-black text-white mb-2">Timetable & Auto-Booking 📅</h2>
                    <p className="text-blue-200 mb-6">Upload your timetable and let AI manage your rides.</p>

                    {/* Agent Status Panel */}
                    <div className="bg-black/30 backdrop-blur-md rounded-xl p-4 max-w-md mx-auto border border-blue-500/30 flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <div className="text-left">
                                <div className="text-xs text-blue-300 font-bold uppercase tracking-wider">Agent Status</div>
                                <div className="flex items-center gap-2">
                                    <span className="relative flex h-3 w-3">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                                    </span>
                                    <span className="text-white font-bold">Active (Checks at 8 PM)</span>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={handleResetAgent}
                                    className="bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold px-3 py-2 rounded-lg transition-transform active:scale-95"
                                    title="Clear 'Already Booked' Log"
                                >
                                    🧹 Reset
                                </button>
                                <button
                                    onClick={handleTestAgent}
                                    className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-2 rounded-lg transition-transform active:scale-95"
                                >
                                    ⚡ Force Run
                                </button>
                            </div>
                        </div>
                        <p className="text-[10px] text-gray-400 text-left">
                            * Uses "Tomorrow's" schedule. If today is booked, verify in Dashboard.
                            <br />* <b>Tip:</b> If it says "Already booked", click Reset to try again.
                        </p>
                    </div>
                </div>

                <div className="flex justify-center gap-2 mt-8 bg-black/20 p-1 rounded-xl w-fit mx-auto backdrop-blur-sm">
                    {["timetable", "team", "holidays", "leaves", "settings"].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all capitalize ${activeTab === tab ? "bg-white text-black shadow-lg" : "text-gray-400 hover:text-white"
                                }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            {/* TIMETABLE TAB */}
            {activeTab === "timetable" && (
                <div className="space-y-6 animate-fade-in">
                    {/* Upload Area */}
                    <div className="bg-gray-900 border-2 border-dashed border-gray-700 rounded-3xl p-8 text-center hover:border-blue-500 transition-colors group relative overflow-hidden">
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleTimetableUpload}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <div className="relative z-0">
                            <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">📤</div>
                            <h3 className="text-xl font-bold text-white mb-2">Upload Timetable Image</h3>
                            <p className="text-gray-400 text-sm mb-6">Drag & drop or click to upload</p>

                            {isExtracting && (
                                <div className="inline-flex items-center gap-2 bg-blue-600/20 text-blue-400 px-4 py-2 rounded-full text-sm font-bold animate-pulse">
                                    <span>✨ AI is extracting schedule...</span>
                                </div>
                            )}

                            {!isExtracting && (
                                <div className="bg-blue-900/30 text-blue-300 text-xs p-3 rounded-xl border border-blue-500/30 max-w-sm mx-auto">
                                    ℹ️ Powered by Gemini Vision AI. Automatically detects class timings.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Extracted Data Display */}
                    {timetable && (
                        <div className="space-y-4">
                            <h3 className="text-lg font-bold text-gray-400 uppercase tracking-wider">📅 Weekly Schedule</h3>
                            {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
                                .filter(day => timetable[day])
                                .map((day) => {
                                    const timings = timetable[day];
                                    return (
                                        <div key={day} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex justify-between items-center transition-colors hover:border-blue-500/50">
                                            <h4 className="text-xl font-bold text-white w-32">{day}</h4>

                                            <div className="flex items-center gap-8 flex-1 justify-center">
                                                {/* Start Time */}
                                                <div className="text-center group">
                                                    <div className="text-xs text-gray-500 mb-1 uppercase tracking-widest group-hover:text-green-400 transition-colors">College Start</div>
                                                    <div className="text-2xl font-black text-green-400 bg-green-900/10 px-4 py-2 rounded-xl border border-green-500/20">
                                                        {timings.start}
                                                    </div>
                                                </div>

                                                <div className="text-gray-600 text-2xl font-light">➜</div>

                                                {/* End Time */}
                                                <div className="text-center group">
                                                    <div className="text-xs text-gray-500 mb-1 uppercase tracking-widest group-hover:text-red-400 transition-colors">College End</div>
                                                    <div className="text-2xl font-black text-red-400 bg-red-900/10 px-4 py-2 rounded-xl border border-red-500/20">
                                                        {timings.end}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    )}
                </div>
            )}


            {/* TEAM TAB */}
            {activeTab === "team" && (
                <div className="space-y-6 animate-fade-in">
                    <div className="bg-gray-900 p-8 rounded-3xl border border-gray-800 shadow-2xl relative overflow-hidden">
                        <div className="relative z-10">
                            <h3 className="text-2xl font-black text-white mb-2">My Travel Team 👥</h3>
                            <p className="text-gray-400 text-sm mb-6">Add up to 5 friends. We'll pick everyone up in one auto!</p>

                            {/* Add Friend */}
                            <div className="flex gap-4 mb-8">
                                <input
                                    type="tel"
                                    placeholder="Enter Friend's Phone Number"
                                    value={friendPhone}
                                    onChange={(e) => setFriendPhone(e.target.value)}
                                    className="flex-1 bg-gray-800 text-white p-4 rounded-xl border border-gray-700 outline-none focus:border-blue-500 font-mono text-lg"
                                />
                                <button
                                    onClick={handleAddFriend}
                                    disabled={searchingFriend}
                                    className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-xl font-bold transition-all active:scale-95 disabled:opacity-50"
                                >
                                    {searchingFriend ? "Searching..." : "Add Friend"}
                                </button>
                            </div>

                            {/* Team List */}
                            <div className="space-y-4">
                                <h4 className="text-sm font-bold text-gray-500 uppercase tracking-widest">Team Members ({team.length}/5)</h4>

                                {team.length === 0 && (
                                    <div className="text-center py-8 border-2 border-dashed border-gray-800 rounded-xl">
                                        <p className="text-gray-500">No friends added yet.</p>
                                    </div>
                                )}

                                {team.map((member: any, index: number) => (
                                    <div key={index} className="bg-gray-800 p-4 rounded-2xl flex items-center justify-between border border-gray-700 hover:border-blue-500/30 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center font-bold text-white shadow-lg">
                                                {member.name?.[0] || "?"}
                                            </div>
                                            <div>
                                                <h4 className="text-white font-bold">{member.name}</h4>
                                                <p className="text-gray-400 text-xs">{member.phone}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={async () => {
                                                if (!user) return;
                                                const newTeam = team.filter((_, i) => i !== index);
                                                setTeam(newTeam);
                                                await updateDoc(doc(db, "users", user.uid), { "timetable.team": newTeam });
                                            }}
                                            className="text-red-400 hover:bg-red-900/20 p-2 rounded-lg transition-colors text-sm font-bold"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* HOLIDAYS TAB */}
            {activeTab === "holidays" && (
                <div className="space-y-8 animate-fade-in">
                    {/* Upload Section */}
                    {!holidays || holidays.length === 0 ? (
                        <div className="bg-gray-900 border-2 border-dashed border-gray-700 rounded-3xl p-8 text-center hover:border-green-500 transition-colors group relative">
                            <input
                                type="file"
                                accept="image/*,application/pdf"
                                onChange={handleHolidayUpload}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">🗓️</div>
                            <h3 className="text-xl font-bold text-white mb-2">Upload Academic Calendar</h3>
                            <p className="text-gray-400 text-sm">Upload PDF or Image. AI will mark holidays in green.</p>
                            {isExtracting && <p className="text-green-400 mt-4 animate-pulse">Extracting dates...</p>}
                        </div>
                    ) : (
                        <CalendarView holidays={holidays} onUpload={handleHolidayUpload} />
                    )}
                </div>
            )}

            {/* LEAVES TAB */}
            {activeTab === "leaves" && (
                <div className="space-y-6 animate-fade-in">
                    <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800">
                        <h3 className="text-lg font-bold text-white mb-4">Manage Leaves 🌴</h3>
                        <div className="flex gap-4 mb-6">
                            <input
                                type="date"
                                value={leaveDate}
                                onChange={(e) => setLeaveDate(e.target.value)}
                                className="flex-1 bg-gray-800 text-white p-3 rounded-xl border border-gray-700 outline-none focus:border-blue-500"
                            />
                            <input
                                type="text"
                                placeholder="Reason (Optional)"
                                value={leaveReason}
                                onChange={(e) => setLeaveReason(e.target.value)}
                                className="flex-1 bg-gray-800 text-white p-3 rounded-xl border border-gray-700 outline-none focus:border-blue-500"
                            />
                            <button
                                onClick={handleAddLeave}
                                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold"
                            >
                                + Add Leave
                            </button>
                        </div>

                        <div className="space-y-3">
                            {leaves.map((leave) => (
                                <div key={leave.id} className="bg-gray-800 p-4 rounded-xl flex justify-between items-center border border-gray-700">
                                    <div>
                                        <div className="text-white font-bold">{new Date(leave.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                                        <div className="text-sm text-gray-400">{leave.reason || "No reason provided"}</div>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteLeave(leave)}
                                        className="text-red-400 hover:text-red-300 p-2"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            ))}
                            {leaves.length === 0 && <p className="text-center text-gray-500">No leaves added yet.</p>}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === "settings" && <SettingsView />}
        </div>
    );
}

// Settings Component
function SettingsView() {
    const { user } = useAuth();
    const [settings, setSettings] = useState({
        morningOffset: 30,
        eveningOffset: 15,
        defaultPayment: "Cash/Online",
        autoBookingEnabled: false
    });
    const [loading, setLoading] = useState(false);

    // Fetch Settings
    useEffect(() => {
        if (user) {
            getDoc(doc(db, "users", user.uid)).then(d => {
                if (d.exists() && d.data().autoBookingSettings) {
                    setSettings(d.data().autoBookingSettings);
                }
            });
        }
    }, [user]);

    const handleSave = async () => {
        if (!user) return;
        setLoading(true);
        try {
            await updateDoc(doc(db, "users", user.uid), {
                autoBookingSettings: settings
            });
            alert("Settings Saved Successfully!");
        } catch (error) {
            console.error(error);
            alert("Failed to save settings.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-gray-900 p-8 rounded-3xl border border-gray-800 shadow-2xl animate-fade-in max-w-2xl mx-auto">
            <h3 className="text-xl font-bold text-white mb-2">Auto-Booking Settings</h3>
            <p className="text-gray-400 text-sm mb-6">Configure when autos should arrive and your payment preferences</p>

            <div className="space-y-6">
                {/* Morning Offset */}
                <div>
                    <label className="block text-sm font-bold text-gray-300 mb-2">Morning Ride Offset (minutes before first class)</label>
                    <input
                        type="number"
                        value={settings.morningOffset}
                        onChange={(e) => setSettings({ ...settings, morningOffset: Number(e.target.value) })}
                        className="w-full bg-gray-800 text-white p-3 rounded-xl border border-gray-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                    />
                    <p className="text-gray-500 text-xs mt-1">Auto will arrive this many minutes before your first class</p>
                </div>

                {/* Evening Offset */}
                <div>
                    <label className="block text-sm font-bold text-gray-300 mb-2">Evening Ride Offset (minutes after last class)</label>
                    <input
                        type="number"
                        value={settings.eveningOffset}
                        onChange={(e) => setSettings({ ...settings, eveningOffset: Number(e.target.value) })}
                        className="w-full bg-gray-800 text-white p-3 rounded-xl border border-gray-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                    />
                    <p className="text-gray-500 text-xs mt-1">Auto will arrive this many minutes after your last class</p>
                </div>

                {/* Payment Method */}
                <div>
                    <label className="block text-sm font-bold text-gray-300 mb-2">Default Payment Method</label>
                    <div className="relative">
                        <select
                            value={settings.defaultPayment}
                            onChange={(e) => setSettings({ ...settings, defaultPayment: e.target.value })}
                            className="w-full bg-gray-800 text-white p-3 rounded-xl border border-gray-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 appearance-none cursor-pointer"
                        >
                            <option value="Cash/Online">Cash/Online</option>
                            <option value="Credits">Credits</option>
                            <option value="Subscription">Subscription</option>
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">▼</div>
                    </div>
                </div>

                {/* Auto Booking Toggle */}
                <div className="flex items-center gap-3 pt-2">
                    <input
                        type="checkbox"
                        id="autoBooking"
                        checked={settings.autoBookingEnabled}
                        onChange={(e) => setSettings({ ...settings, autoBookingEnabled: e.target.checked })}
                        className="w-5 h-5 rounded bg-gray-800 border-gray-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-900"
                    />
                    <label htmlFor="autoBooking" className="text-white font-bold cursor-pointer select-none">
                        Enable automatic booking
                    </label>
                </div>

                {/* Save Button */}
                <button
                    onClick={handleSave}
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl mt-4 transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? "Saving..." : "Save Settings"}
                </button>
            </div>
        </div>
    );
}

// Calendar Component
function CalendarView({ holidays, onUpload }: { holidays: any[], onUpload: (e: any) => void }) {
    const [currentDate, setCurrentDate] = useState(new Date());

    const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);

    const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

    const isHoliday = (day: number) => {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return holidays.find(h => h.date === dateStr);
    };

    return (
        <div className="bg-[#1e293b] rounded-3xl p-6 shadow-2xl border border-gray-700/50">
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-2">
                    <span className="text-2xl">📅</span>
                    <h3 className="text-xl font-bold text-white">Holiday Calendar ({holidays.length} holidays)</h3>
                </div>
                <div className="relative overflow-hidden w-8 h-8">
                    <input type="file" accept="image/*,application/pdf" onChange={onUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                    <button className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-lg text-xs" title="Upload New Calendar">📤</button>
                </div>
            </div>

            {/* Calendar Controls */}
            <div className="flex justify-between items-center mb-6 px-4">
                <button onClick={prevMonth} className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700 text-gray-400">❮</button>
                <div className="text-white font-bold text-lg">
                    {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </div>
                <button onClick={nextMonth} className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700 text-gray-400">❯</button>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-7 gap-2 text-center text-sm font-medium mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                    <div key={d} className="text-gray-500 py-2">{d}</div>
                ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
                {/* Empty slots for offset */}
                {Array.from({ length: firstDay }).map((_, i) => (
                    <div key={`empty-${i}`} className="h-12"></div>
                ))}

                {/* Days */}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const holiday = isHoliday(day);
                    const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();

                    return (
                        <div
                            key={day}
                            className={`
                                h-12 flex flex-col items-center justify-center rounded-lg text-sm relative transition-all group cursor-default
                                ${holiday ? 'bg-green-500 text-white font-bold shadow-[0_0_15px_rgba(34,197,94,0.4)] scale-105 z-10' : 'bg-transparent text-gray-300 hover:bg-gray-800'}
                                ${isToday && !holiday ? 'border border-blue-500 text-blue-400' : ''}
                            `}
                        >
                            {day}
                            {holiday && (
                                <div className="absolute -top-10 bg-black/90 text-white text-xs p-2 rounded mx-auto whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-gray-700 shadow-xl">
                                    {holiday.name}
                                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-black rotate-45"></div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Legend */}
            <div className="flex gap-4 mt-6 text-xs text-gray-400 justify-center border-t border-gray-800 pt-4">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-sm"></div> Holiday
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 border border-blue-500 rounded-sm"></div> Today
                </div>
            </div>
        </div>
    );
}
