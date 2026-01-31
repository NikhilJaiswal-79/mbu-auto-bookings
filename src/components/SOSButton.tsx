"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { addDoc, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function SOSButton({ rideDetails }: { rideDetails?: any }) {
    const { user, userProfile } = useAuth();
    const [triggered, setTriggered] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSOS = async () => {
        if (!confirm("Are you sure you want to send an Emergency SOS? This will alert your parents and MBU security.")) return;
        if (!user || !userProfile?.parentContact?.phone) {
            alert("Parent contact not found! Please update your profile.");
            return;
        }

        setLoading(true);

        // Get Location
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(async (position) => {
                const { latitude, longitude } = position.coords;
                const mapsLink = `https://www.google.com/maps?q=${latitude},${longitude}`;

                await sendAlert(mapsLink);
            }, async (error) => {
                console.error("Geolocation denied/error", error);
                await sendAlert("Location Unavailable");
            }, {
                enableHighAccuracy: true,
                timeout: 5000, // Timeout after 5 seconds to avoid long waits
                maximumAge: 0
            });
        } else {
            await sendAlert("Location Not Supported");
        }
    };

    const sendAlert = async (locationLink: string) => {
        try {
            // 1. Log to Firestore FIRST (Critical)
            const alertData = {
                userId: user?.uid,
                userName: userProfile?.name,
                timestamp: new Date().toISOString(),
                location: locationLink,
                rideDetails: rideDetails || null,
                status: "ACTIVE",
                emailStatus: "PENDING"
            };

            const docRef = await addDoc(collection(db, "sos_alerts"), alertData);

            // 2. Call Email API
            let emailSuccess = false;
            try {
                const res = await fetch("/api/sos", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        studentName: userProfile?.name,
                        studentPhone: userProfile?.phone || "Not Provided",
                        studentEmail: user?.email,
                        parentPhone: userProfile?.parentContact?.phone,
                        parentEmail: userProfile?.parentContact?.email,
                        location: locationLink,
                        rideDetails
                    })
                });

                const data = await res.json();
                if (res.ok) {
                    emailSuccess = true;
                    // Update DB status
                    // Note: We don't need to wait for this update to alert the user
                    // await updateDoc(docRef, { emailStatus: "SENT" }); 
                } else {
                    console.error("SOS API Error:", data.error);
                    alert(`SOS Recorded, but Email Failed: ${data.error || "Unknown Error"}`);
                }
            } catch (apiError) {
                console.error("SOS Fetch Error:", apiError);
                alert("SOS Recorded, but Network Request Failed.");
            }

            setTriggered(true);

            if (emailSuccess) {
                alert("🚨 SOS SENT! Parents & Security have been notified via Email & Dashboard.");
            }

        } catch (error) {
            console.error("SOS System Failure", error);
            alert("CRITICAL FAILURE: Could not log SOS. Use Phone to call 100 immediately.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            onClick={handleSOS}
            className={`w-full py-5 rounded-2xl font-black text-xl uppercase tracking-widest shadow-[0_0_30px_rgba(220,38,38,0.4)] animate-pulse flex items-center justify-center gap-3 transition-all active:scale-95 ${triggered ? "bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700" : "bg-gradient-to-r from-red-600 to-rose-600 text-white hover:from-red-500 hover:to-rose-500 border border-red-500/50"
                }`}
            disabled={triggered || loading}
        >
            <span className="text-3xl drop-shadow-md">🆘</span>
            {loading ? "Sending Alert..." : triggered ? "SOS SENT ✅" : "Emergency SOS"}
        </button>
    );
}
