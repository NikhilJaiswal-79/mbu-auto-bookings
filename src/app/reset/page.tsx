"use client";
import { useState } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";

export default function ResetPage() {
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState("");

    const handleReset = async () => {
        if (!confirm("⚠️ DANGER: This will delete ALL bookings and user accounts. Are you sure?")) return;

        setLoading(true);
        setStatus("Deleting data...");

        try {
            // Delete Bookings
            const bookingsSnap = await getDocs(collection(db, "bookings"));
            const bookingPromises = bookingsSnap.docs.map(d => deleteDoc(d.ref));
            await Promise.all(bookingPromises);
            setStatus(`Deleted ${bookingsSnap.size} bookings.`);

            // Delete Users (Optional - usually we want to keep users but reset state)
            const usersSnap = await getDocs(collection(db, "users"));
            const userPromises = usersSnap.docs.map(d => deleteDoc(d.ref));
            await Promise.all(userPromises);

            setStatus(prev => `${prev}\nDeleted ${usersSnap.size} users.\n\n✅ DATA WIPED SUCCESSFULLY.`);
        } catch (error) {
            console.error(error);
            setStatus("Error deleting data: " + error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
            <h1 className="text-4xl font-bold text-red-500 mb-4">⚠️ DANGER ZONE</h1>
            <p className="text-gray-400 mb-8 max-w-md">
                This page is for development testing only. It allows you to wipe the database to start fresh.
            </p>

            <button
                onClick={handleReset}
                disabled={loading}
                className="bg-red-600 hover:bg-red-700 text-white font-bold py-6 px-12 rounded-2xl text-2xl shadow-[0_0_30px_rgba(220,38,38,0.5)] transition-all active:scale-95 disabled:opacity-50"
            >
                {loading ? "DELETING..." : "💣 NUKE ALL DATA"}
            </button>

            <pre className="mt-8 bg-gray-900 p-4 rounded-xl border border-gray-800 text-left text-sm font-mono text-green-400 min-w-[300px]">
                {status || "Waiting..."}
            </pre>

            <a href="/" className="mt-8 text-gray-500 hover:text-white underline">Back to Home</a>
        </div>
    );
}
