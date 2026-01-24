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
            });
        } else {
            await sendAlert("Location Not Supported");
        }
    };

    const sendAlert = async (locationLink: string) => {
        try {
            // Construct Message
            let message = `🚨 EMERGENCY ALERT: ${userProfile?.name} has triggered an SOS!`;

            if (rideDetails) {
                message += `\n\nUnknown Ride Details:\nFrom: ${rideDetails.pickup}\nTo: ${rideDetails.drop}\nToken: ${rideDetails.tokenNumber}`;
                // Add vehicle number if available in rideDetails
                if (rideDetails.vehicleNumber) message += `\nVehicle: ${rideDetails.vehicleNumber}`;
            }

            message += `\n\n📍 LIVE LOCATION: ${locationLink}`;
            message += `\n\nPlease call immediately.`;

            // Call API
            const res = await fetch("/api/sos", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    studentName: userProfile?.name,
                    studentPhone: userProfile?.phone || "Not Provided",
                    studentEmail: user?.email, // Fallback for testing if parent email missing
                    parentPhone: userProfile?.parentContact?.phone,
                    parentEmail: userProfile?.parentContact?.email, // Assuming this might exist or we use student email for now
                    location: locationLink,
                    rideDetails
                })
            });

            if (res.ok) {
                // Save to Firestore for Record
                await addDoc(collection(db, "sos_alerts"), {
                    userId: user?.uid,
                    userName: userProfile?.name,
                    timestamp: new Date().toISOString(),
                    location: locationLink,
                    rideDetails: rideDetails || null,
                    status: "ACTIVE"
                });

                setTriggered(true);
                alert("SOS SENT! Parents & Security have been notified.");
            } else {
                throw new Error("API Failed");
            }

        } catch (error) {
            console.error("SOS failed", error);
            alert("Failed to send SOS. Please call 100.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            onClick={handleSOS}
            className={`w-full py-4 rounded-xl font-bold text-xl uppercase tracking-wider shadow-xl animate-pulse flex items-center justify-center gap-2 ${triggered ? "bg-gray-700 text-gray-400 cursor-not-allowed" : "bg-red-600 hover:bg-red-700 text-white"
                }`}
            disabled={triggered || loading}
        >
            {loading ? "Sending..." : triggered ? "SOS Sent" : "🆘 Emergency SOS"}
        </button>
    );
}
