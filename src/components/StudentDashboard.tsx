"use client";

import { useAuth } from "@/context/AuthContext";
import { useState, useEffect } from "react";
import { collection, addDoc, query, where, onSnapshot, orderBy, updateDoc, doc, increment, runTransaction } from "firebase/firestore";
import { db } from "@/lib/firebase";

import { generateToken, subscribeToServingToken } from "@/lib/tokenService";
import { checkAndTriggerAutoBooking } from "@/lib/bookingAgent"; // 1. Import checkAndTriggerAutoBooking
import RideSharing from "./RideSharing";
import AutomatedBooking from "./AutomatedBooking";
import WeatherWidget from "./WeatherWidget";
import SOSButton from "./SOSButton";
import QuizComponent from "./QuizComponent";
import { NotificationToast, ToastType } from "./NotificationToast";

import dynamic from "next/dynamic";

const MapComponent = dynamic(() => import("./MapComponent"), { ssr: false });

import VoiceBookingAgent from "./VoiceBookingAgent";

export default function StudentDashboard() {
    const { user, userProfile, logout } = useAuth();
    const [activeTab, setActiveTab] = useState<"home" | "auto" | "share" | "timetable">("home");
    const [showBookingModal, setShowBookingModal] = useState(false);

    // Voice Command State
    const [showVoiceModal, setShowVoiceModal] = useState(false);
    const [voiceData, setVoiceData] = useState<any>(null);

    const handleVoiceParsed = (data: any) => {
        console.log("🎤 Voice Data Parsed:", data);

        // 1. Address Resolution Fix: explicitly match "Home", "College", etc.
        let resolvedPickup = data.pickup;
        let resolvedDrop = data.drop;

        if (savedAddresses.length > 0) {
            console.log("🔍 Attempting Address Resolution. Inputs:", { pickup: data.pickup, drop: data.drop });
            console.log("📂 Saved Addresses:", savedAddresses);

            // Try to resolve Pickup
            const cleanPickup = data.pickup?.toLowerCase().trim();
            const matchedPickup = savedAddresses.find(addr =>
                addr.name?.toLowerCase().trim() === cleanPickup ||
                addr.type?.toLowerCase().trim() === cleanPickup
            );
            if (matchedPickup) {
                console.log("✅ Resolved Pickup:", matchedPickup.address);
                resolvedPickup = matchedPickup.address;
            }

            // Try to resolve Drop
            const cleanDrop = data.drop?.toLowerCase().trim();
            const matchedDrop = savedAddresses.find(addr =>
                addr.name?.toLowerCase().trim() === cleanDrop ||
                addr.type?.toLowerCase().trim() === cleanDrop
            );
            if (matchedDrop) {
                console.log("✅ Resolved Drop:", matchedDrop.address);
                resolvedDrop = matchedDrop.address;
            }
        }

        // 2. Update Data with Resolved Addresses
        const refinedData = {
            ...data,
            pickup: resolvedPickup,
            drop: resolvedDrop
        };

        setVoiceData(refinedData);
        setShowVoiceModal(true);
    };

    const confirmVoiceBooking = async () => {
        if (!voiceData) return;

        // Apply voice data to main state
        setPickup(voiceData.pickup || "Current Location");
        setDrop(voiceData.drop || "");
        setRideType(voiceData.rideType || "instant");

        if (voiceData.rideType === "scheduled" && voiceData.scheduledTime) {
            setScheduledTime(voiceData.scheduledTime);
            // Default to today if date not mentioned, or handle date parsing later
            setScheduledDate(new Date().toISOString().split('T')[0]);
        }

        // Close modal
        setShowVoiceModal(false);

        // Trigger Booking (slight delay to allow state update? Or pass directly?)
        // Better to set state, then Trigger manually or Auto? 
        // User asked: "auto should be booked accordingly... before booking just confirm"
        // So hitting "Confirm" here should ideally start the booking process.

        // Let's call a slightly modified booking handler or just rely on state update and user hitting "Book"?
        // Actually, user expects "auto should be booked". Let's try to trigger it.
        // But handleBookRide relies on state `pickup`, `drop`. 
        // We can pass arguments to handleBookRide or modify it. 
        // Easier: Just pre-fill and let them hit "Book Now" ? 
        // prompt says "autombooked accordingly... before booking just confirm". 
        // So the flow: Voice -> Modal (Confirm?) -> Booking.

        // Let's defer specific booking call to ensure state is set, OR call internal book function with data.
        // For safety, let's call the internal booking logic with explicit data if possible, 
        // or just set state and show the standard booking modal?
        // Let's set state and OPEN the standard booking modal if it wasn't open, 
        // OR if we want 1-click:

        // Hack: We need a way to reuse handleBookRide logic with specific values. 
        // For now, let's Use the "Show Booking Modal" approach but pre-filled.
        // Or better: Direct Booking if confirmed.

        // Let's try direct booking by calling a helper
        executeVoiceBooking(voiceData);
    };

    const executeVoiceBooking = async (data: any) => {
        // Payment Logic: Explicit Voice Command > Hierarchy (Sub > Credits > Cash)
        let finalPaymentMode = "cash";

        if (data.paymentMode) {
            finalPaymentMode = data.paymentMode; // User explicitly asked
        } else {
            // Default Hierarchy
            finalPaymentMode = subscription?.active ? "subscription" : (credits > 0 ? "credits" : "cash");
        }

        // Safety Check: If user asked for subscription but has none
        if (finalPaymentMode === "subscription" && !subscription?.active) {
            showToast("No active subscription. Falling back to default.", "info");
            finalPaymentMode = credits > 0 ? "credits" : "cash";
        }

        setLoading(true);
        setLoading(true);
        try {
            const tokenNumber = await generateToken();
            setMyToken(tokenNumber);

            // Check Emergency Limit
            if (isEmergency && emergencyUsage >= 5) {
                showToast("Monthly emergency limit reached (5/5).", "error");
                setLoading(false);
                return;
            }
            // Validation Only: Check if user has credits (but DO NOT deduct yet)
            if (finalPaymentMode === "credits") {
                if (credits < 1) {
                    showToast("Insufficient credits to book.", "error");
                    setLoading(false);
                    return;
                }
            }

            const rideData = {
                studentId: user?.uid,
                studentName: userProfile?.name || "Student",
                pickup: data.pickup || "Current Location",
                drop: data.drop,
                rideType: data.rideType || "instant",
                scheduledDate: data.rideType === "scheduled" ? (new Date().toISOString().split('T')[0]) : null, // Default Today
                scheduledTime: data.scheduledTime || null,
                paymentMode: finalPaymentMode,
                status: "PENDING",
                createdAt: new Date().toISOString(),
                tokenNumber: 0, // Should be generated token? Yes.
                studentPhone: userProfile?.phone || "Not Provided",
                isEmergency: false
            };

            // Fix Token (using same logic as handleBookRide)
            rideData.tokenNumber = tokenNumber;

            const docRef = await addDoc(collection(db, "bookings"), rideData);
            setCurrentBookingId(docRef.id);

            // Sync Local State for UI
            setPaymentMode(finalPaymentMode as any);
            setRideType(rideData.rideType as any); // Ensure type is synced
            if (rideData.scheduledDate) setScheduledDate(rideData.scheduledDate);
            if (rideData.scheduledTime) setScheduledTime(rideData.scheduledTime);

            setBookingStatus("PENDING");
            setShowVoiceModal(false);

        } catch (e) {
            console.error(e);
            showToast("Voice Booking Failed", "error");
        } finally {
            setLoading(false);
        }
    };


    {/* Existing content... */ }
    {/* ... */ }


    // Address & Pricing State
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [activeField, setActiveField] = useState<"pickup" | "drop" | "collegeName" | "homeAddress" | "newAddress" | null>(null);
    const [savedAddresses, setSavedAddresses] = useState<any[]>([]);

    // Coordinates State
    const [pickupCoords, setPickupCoords] = useState<{ lat: number, lng: number } | null>(null);
    const [dropCoords, setDropCoords] = useState<{ lat: number, lng: number } | null>(null);

    const [showSaveAddressModal, setShowSaveAddressModal] = useState(false);
    const [newAddress, setNewAddress] = useState({
        type: "Home",
        customName: "",
        address: "",
        landmark: "",
        lat: 0,
        lng: 0
    });
    const [estimatedFare, setEstimatedFare] = useState(25);

    // Auto Booking State (Needed for handlers)
    const [pickup, setPickup] = useState("");
    const [drop, setDrop] = useState("");
    const [rideType, setRideType] = useState<"instant" | "scheduled">("instant");
    const [paymentMode, setPaymentMode] = useState<"cash" | "credits" | "subscription">("cash");
    const [isEmergency, setIsEmergency] = useState(false);
    const [emergencyReason, setEmergencyReason] = useState("Medical Emergency");
    const [loading, setLoading] = useState(false);
    const [scheduledDate, setScheduledDate] = useState("");
    const [scheduledTime, setScheduledTime] = useState("");


    // Ride States
    const [currentBookingId, setCurrentBookingId] = useState<string | null>(null);
    const [bookingStatus, setBookingStatus] = useState<"IDLE" | "PENDING" | "CONFIRMED" | "COMPLETED">("IDLE");
    const [activeRide, setActiveRide] = useState<any>(null);

    // Token System State
    const [myToken, setMyToken] = useState<number | null>(null);
    const [servingToken, setServingToken] = useState<number | null>(null);

    const [showWallet, setShowWallet] = useState(false);
    const [walletView, setWalletView] = useState<"credits" | "subscription">("credits");
    const [showHistory, setShowHistory] = useState(false);
    const [history, setHistory] = useState<any[]>([]);



    // Address Modal State
    const [addressModalView, setAddressModalView] = useState<"list" | "add">("list");
    const [deletingIndex, setDeletingIndex] = useState<number | null>(null); // For inline delete confirmation

    // Lost & Found State
    const [showLostFoundModal, setShowLostFoundModal] = useState(false);
    const [lostItemDesc, setLostItemDesc] = useState("");
    const [lostItemName, setLostItemName] = useState("");
    const [selectedLostRide, setSelectedLostRide] = useState<string | null>(null);
    const [myLostReports, setMyLostReports] = useState<any[]>([]);

    // Emergency Limit State
    const [emergencyUsage, setEmergencyUsage] = useState(0);

    useEffect(() => {
        if (!user) return;

        // Calculate start of current month
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

        const q = query(
            collection(db, "bookings"),
            where("studentId", "==", user.uid),
            where("isEmergency", "==", true),
            where("createdAt", ">=", startOfMonth)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setEmergencyUsage(snapshot.size);
        });

        return () => unsubscribe();
    }, [user]);

    // Fetch My Lost Reports
    useEffect(() => {
        if (user && showLostFoundModal) {
            const q = query(
                collection(db, "lost_found"),
                where("userId", "==", user.uid),
                orderBy("createdAt", "desc")
            );
            const unsubscribe = onSnapshot(q, (snapshot) => {
                setMyLostReports(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            });
            return () => unsubscribe();
        }
    }, [user, showLostFoundModal]);

    // 9. Persistent Serving Token Display
    // Ensure we are always subscribed
    useEffect(() => {
        const unsubscribe = subscribeToServingToken((token) => {
            setServingToken(token);
        });
        return () => unsubscribe();
    }, []);

    // Toast State
    const [toast, setToast] = useState<{ message: string, type: ToastType } | null>(null);
    const showToast = (message: string, type: ToastType) => {
        setToast({ message, type });
    };

    // Mock Data (replace effectively with real data later)
    const [credits, setCredits] = useState(userProfile?.credits || 0);
    const [subscription, setSubscription] = useState<any>(userProfile?.subscription || null);

    // Sync profile data
    useEffect(() => {
        if (userProfile) {
            setCredits(userProfile.credits || 0);
            setSubscription(userProfile.subscription || null);
            // 5. Do NOT prefill pickup address
            // if (userProfile.collegeName && pickup === "MBU Campus") {
            //    setPickup(userProfile.collegeName);
            // }
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
            setShowEditProfile(false);
            showToast("Profile Updated Successfully!", "success");
        } catch (error) {
            console.error("Error updating profile", error);
            showToast("Failed to update profile.", "error");
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

    // 2. Add useEffect to call checkAndTriggerAutoBooking with user object
    useEffect(() => {
        if (user) {
            // --- AUTO BOOKING AGENT TRIGGER ---
            // Run silently in background after a short delay
            setTimeout(async () => {
                const result = await checkAndTriggerAutoBooking(user);
                // 3. Show toast if it books.
                if (result?.success) {
                    showToast("🤖 Auto-Agent: " + result.message, "success");
                    // Refresh bookings? The listener above handles it.
                }
            }, 5000);
        }
    }, [user]); // Depend on user to trigger when user object is available

    // Fetch History
    useEffect(() => {
        if (user && (showHistory || showLostFoundModal)) {
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
    }, [user, showHistory, showLostFoundModal]);

    const handleBuyCredits = async (amount: number, cost: number) => {
        if (!user) return;
        try {
            await updateDoc(doc(db, "users", user.uid), {
                credits: increment(amount)
            });
            // State updated via onSnapshot listener
            showToast("Purchase Successful! Credits Added.", "success");
        } catch (error) {
            console.error(error);
            showToast("Purchase Failed", "error");
        }
    };

    const handleBuyPass = async (type: string, cost: number, days: number) => {
        if (!user) return;
        try {
            const newSubscription = {
                active: true,
                type,
                expiryDate: new Date(Date.now() + days * 86400000).toISOString()
            };
            await updateDoc(doc(db, "users", user.uid), {
                subscription: newSubscription
            });
            // State updated via onSnapshot listener
            showToast("Pass Activated!", "success");
        } catch (error) {
            console.error(error);
            showToast("Purchase Failed", "error");
        }
    };

    // Address Autocomplete (Debounced)
    // Address Autocomplete (Debounced)
    useEffect(() => {
        let query = "";
        if (activeField === "pickup") query = pickup;
        else if (activeField === "drop") query = drop;
        else if (activeField === "collegeName") query = editFormData.collegeName;
        else if (activeField === "homeAddress") query = editFormData.homeAddress;
        else if (activeField === "newAddress") query = newAddress.address;

        // Pre-process all saved addresses
        console.log("DEBUG: savedAddresses state:", savedAddresses);
        const allSaved = (savedAddresses || []).map(addr => ({
            ...addr,
            isSaved: true,
            display_name: addr.address // Ensure consistent key for rendering
        }));

        if (!query) {
            setSuggestions(allSaved);
            return;
        }

        // Filter saved addresses
        const matches = allSaved.filter(addr =>
            addr.name?.toLowerCase().includes(query.toLowerCase()) ||
            addr.address?.toLowerCase().includes(query.toLowerCase()) ||
            addr.type?.toLowerCase().includes(query.toLowerCase())
        );

        if (query.length < 3) {
            setSuggestions(matches);
            return;
        }

        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=5`);
                const apiData = await res.json();

                // Combine Saved + API suggestions
                // Filter out duplicates based on address string
                const savedMap = new Set(matches.map(m => m.display_name));
                const uniqueApi = apiData.filter((a: any) => !savedMap.has(a.display_name));

                setSuggestions([...matches, ...uniqueApi]);
            } catch (error) {
                console.error("Autocomplete error", error);
                setSuggestions(matches); // Fallback to just matches
            }
        }, 300); // Reduced delay for better responsiveness

        return () => clearTimeout(timer);
    }, [pickup, drop, editFormData.collegeName, editFormData.homeAddress, newAddress.address, activeField, savedAddresses]);

    const handleSelectSuggestion = (suggestion: any) => {
        const address = suggestion.display_name || suggestion.address;
        const lat = parseFloat(suggestion.lat);
        const lon = parseFloat(suggestion.lon);

        if (activeField === "pickup") {
            setPickup(address);
            if (!isNaN(lat) && !isNaN(lon)) setPickupCoords({ lat, lng: lon });
        }
        else if (activeField === "drop") {
            setDrop(address);
            if (!isNaN(lat) && !isNaN(lon)) setDropCoords({ lat, lng: lon });
        }
        else if (activeField === "collegeName") setEditFormData(prev => ({ ...prev, collegeName: address }));
        else if (activeField === "homeAddress") setEditFormData(prev => ({ ...prev, homeAddress: address }));
        else if (activeField === "newAddress") {
            setNewAddress(prev => ({
                ...prev,
                address: address,
                lat: isNaN(lat) ? 0 : lat,
                lng: isNaN(lon) ? 0 : lon
            }));
        }

        setSuggestions([]);
        setActiveField(null);
        // Recalc fare on selection if in booking mode
        if (activeField === "pickup" || activeField === "drop") calculateFare();
    };

    const calculateFare = () => {
        // Fare functionality removed as per user request
        setEstimatedFare(0);
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
        if (!user) return;

        // Validation
        if (!newAddress.address.trim()) {
            showToast("Address is required!", "error");
            return;
        }
        if (newAddress.type === "Other" && !newAddress.customName.trim()) {
            showToast("Please specify the Address Type Name.", "error");
            return;
        }

        const nameToSave = newAddress.type === "Other" ? newAddress.customName : newAddress.type;
        const addressEntry = {
            name: nameToSave,
            type: newAddress.type,
            address: newAddress.address,
            landmark: newAddress.landmark,
            lat: newAddress.lat,
            lng: newAddress.lng
        };

        const updatedAddresses = [...savedAddresses, addressEntry];
        await updateDoc(doc(db, "users", user.uid), { savedAddresses: updatedAddresses });
        setSavedAddresses(updatedAddresses);
        setNewAddress({ type: "Home", customName: "", address: "", landmark: "", lat: 0, lng: 0 });
        setAddressModalView("list"); // Go back to list
        showToast("Address Saved!", "success");
    };

    const handleDeleteAddress = async (index: number) => {
        // Inline Confirmation Logic
        if (deletingIndex !== index) {
            setDeletingIndex(index);
            // Reset after 3 seconds if not confirmed
            setTimeout(() => setDeletingIndex(null), 3000);
            return;
        }

        // Confirmed (Second Click)
        const updatedAddresses = savedAddresses.filter((_, i) => i !== index);

        if (user) {
            await updateDoc(doc(db, "users", user.uid), { savedAddresses: updatedAddresses });
        }
        setSavedAddresses(updatedAddresses);
        setDeletingIndex(null);
        showToast("Address Deleted", "success");
    };

    // Map Location Handler
    const handleLocationSelect = (lat: number, lng: number, address: string) => {
        if (showSaveAddressModal) {
            setNewAddress(prev => ({ ...prev, address: address }));
            return;
        }

        // Logic: If pickup is set (and not default campus), set drop. If pickup is default, set drop? 
        // Or should we support setting Pickup via map? 
        // Current logic mostly sets drop. Let's make it smarter:
        // If "pickup" field was active last? No track of that.
        // Simple heuristic: If pickup is default/empty, set Pickup?
        // But user usually wants to go FROM College TO somewhere.

        if (pickup === (userProfile?.collegeName || "MBU Campus") && !drop) {
            setDrop(address);
            setDropCoords({ lat, lng });
        } else if (!drop) {
            setDrop(address);
            setDropCoords({ lat, lng });
        } else {
            // Overwrite drop
            setDrop(address);
            setDropCoords({ lat, lng });
        }
    };

    const handleBookRide = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        // Payment Restriction Logic
        if (paymentMode !== "cash" && !isOfficialRoute()) {
            showToast("Credits/Pass valid only for Home <-> College.", "error");
            setPaymentMode("cash");
            return;
        }

        if (paymentMode === "credits" && credits < 1) {
            showToast("Insufficient Credits! Please top up.", "error");
            setShowWallet(true);
            return;
        }
        if (paymentMode === "subscription" && (!subscription?.active)) {
            showToast("No Active Subscription! Please buy a pass.", "error");
            setShowWallet(true);
            return;
        }

        setLoading(true);
        try {
            // EMERGENCY LIMIT CHECK
            if (isEmergency) {
                // Use the authoritative state we added earlier
                if (emergencyUsage >= 5) {
                    showToast("Monthly Emergency Limit Reached (5/Month)", "error");
                    setLoading(false);
                    return;
                }
            }

            const tokenNumber = await generateToken();
            setMyToken(tokenNumber);



            // Credits are deducted when driver accepts (in DriverDashboard)
            // Payment Mode "credits" just validates balance here.

            console.log("DEBUG: Booking Coords:", { pickupCoords, dropCoords, pickup, drop });

            // Fallback Geocoding if coords are missing
            let finalPickupCoords = isEmergency ? null : pickupCoords;
            let finalDropCoords = dropCoords;

            if (!isEmergency && !finalPickupCoords && pickup) {
                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(pickup)}&limit=1`);
                    const data = await res.json();
                    if (data && data.length > 0) {
                        finalPickupCoords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
                    }
                } catch (e) {
                    console.error("Pickup geocoding failed", e);
                }
            }

            if (!finalDropCoords && drop) {
                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(drop)}&limit=1`);
                    const data = await res.json();
                    if (data && data.length > 0) {
                        finalDropCoords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
                    }
                } catch (e) {
                    console.error("Drop geocoding failed", e);
                }
            }

            console.log("DEBUG: Final Booking Coords:", { finalPickupCoords, finalDropCoords });

            const rideData = {
                studentId: user.uid,
                studentName: userProfile?.name || "Student",
                pickup: isEmergency ? "📍 CURRENT LOCATION" : pickup,
                drop,
                pickupCoords: finalPickupCoords,
                dropCoords: finalDropCoords,
                rideType,
                scheduledDate: rideType === "scheduled" ? scheduledDate : null,
                scheduledTime: rideType === "scheduled" ? scheduledTime : null,
                paymentMode,
                status: "PENDING",
                createdAt: new Date().toISOString(),
                tokenNumber: isEmergency ? 0 : tokenNumber,
                studentPhone: userProfile?.phone || "Not Provided",
                isEmergency: isEmergency,
                emergencyReason: isEmergency ? emergencyReason : null
            };

            const docRef = await addDoc(collection(db, "bookings"), rideData);
            setCurrentBookingId(docRef.id);
            setBookingStatus("PENDING");

        } catch (error) {
            console.error("Error booking ride", error);
            showToast("Failed to book ride", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleCancelRide = async () => {
        if (!currentBookingId) return;

        try {
            await updateDoc(doc(db, "bookings", currentBookingId), {
                status: "CANCELLED"
            });
            // Clear state manually instead of calling handleEndRide to avoid "Completed" toast/logic
            setActiveRide(null);
            setBookingStatus("IDLE");
            setCurrentBookingId(null);
            setMyToken(null);
            showToast("Ride Cancelled", "info");
        } catch (error) {
            console.error("Cancellation failed", error);
        }
    };

    const handleEndRide = async () => {
        if (currentBookingId) {
            try {
                await updateDoc(doc(db, "bookings", currentBookingId), {
                    status: "COMPLETED",
                    completedAt: new Date().toISOString()
                });
                showToast("Ride Completed! ✅", "success");
            } catch (error) {
                console.error("Error ending ride", error);
                showToast("Error updating status", "error");
            }
        }
        // Clear local state
        setActiveRide(null);
        setBookingStatus("IDLE");
        setCurrentBookingId(null);
        setMyToken(null);
    };

    const handleReportLostItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !lostItemName || !lostItemDesc) return;

        setLoading(true);
        try {
            await addDoc(collection(db, "lost_found"), {
                userId: user.uid,
                userType: "student",
                type: "LOST",
                itemName: lostItemName,
                description: lostItemDesc,
                rideId: selectedLostRide || null,
                rideDetails: selectedLostRide ? history.find(h => h.id === selectedLostRide) : null,
                status: "OPEN",
                createdAt: new Date().toISOString(),
                studentName: userProfile?.name || "Student",
                contactInfo: userProfile?.phone || user.email
            });
            showToast("Report Submitted Successfully! 🔍", "success");
            setShowLostFoundModal(false);
            setLostItemDesc("");
            setLostItemName("");
            setSelectedLostRide(null);
            // setShowLostFoundModal(false); // Keep open to show the new list
        } catch (error) {
            console.error("Error reporting lost item:", error);
            alert("Failed to submit report. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleCollected = async (reportId: string) => {
        try {
            await updateDoc(doc(db, "lost_found", reportId), {
                status: "COLLECTED"
            });
            alert("Great! Glad you got your item back. 🎉");
        } catch (error) {
            console.error("Error updating status:", error);
        }
    };

    const handleItemCollected = async (reportId: string) => {
        try {
            await updateDoc(doc(db, "lost_found", reportId), {
                status: "COLLECTED"
            });
            showToast("Item marked as collected! Case closed. ✅", "success");
        } catch (error) {
            console.error("Error updating status", error);
            showToast("Failed to update status", "error");
        }
    };


    if (bookingStatus === "PENDING") {
        return (
            <div className="flex flex-col items-center justify-center p-6 space-y-6 animate-fade-in">
                {/* Token Card */}
                <div className="bg-gradient-to-br from-yellow-500/10 to-transparent border border-yellow-500/50 p-8 rounded-3xl text-center w-full max-w-md shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-yellow-500 to-transparent animate-pulse"></div>

                    {rideType === "scheduled" ? (
                        <>
                            <div className="text-4xl mb-4">📅</div>
                            <h2 className="text-xl font-bold text-yellow-500 mb-1">WAITING FOR DRIVER</h2>
                            <div className="my-6">
                                <p className="text-gray-400 text-sm uppercase tracking-wider mb-2">Scheduled For</p>
                                <div className="text-4xl font-black text-white tracking-tight">{scheduledTime || "N/A"}</div>
                                <div className="text-sm text-gray-500 mt-1">{scheduledDate}</div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="text-4xl mb-4">🎫</div>
                            <h2 className="text-xl font-bold text-yellow-500 mb-1">QUEUE STATUS</h2>

                            <div className="my-6">
                                <p className="text-gray-400 text-sm uppercase tracking-wider mb-2">Your Token Number</p>
                                <div className="text-6xl font-black text-white tracking-tight">{myToken}</div>
                            </div>
                        </>
                    )}

                    <div className="bg-black/40 rounded-xl p-4 border border-white/5 space-y-2">
                        {rideType !== "scheduled" && (
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-400">Currently Serving</span>
                                <span className="text-green-400 font-mono font-bold">Token {servingToken || "-"}</span>
                            </div>
                        )}
                        <div className="bg-gray-800 p-4 rounded-xl flex justify-between items-center">
                            <span className="text-gray-400">Payment Mode</span>
                            <span className="font-bold text-white capitalize">{paymentMode}</span>
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
        if (activeRide.rideType === "scheduled") {
            return (
                <div className="space-y-6 animate-fade-in">
                    <div className="bg-blue-900/20 border border-blue-500/50 p-8 rounded-3xl text-center shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent animate-pulse"></div>
                        <h2 className="text-3xl font-black text-blue-400 mb-2">Ride Confirmed! ✅</h2>
                        <p className="text-gray-300 text-lg">Your auto is scheduled.</p>

                        <div className="my-6 bg-black/40 p-4 rounded-xl border border-blue-500/20 inline-block">
                            <p className="text-xs text-blue-300 uppercase font-bold tracking-wider mb-1">Scheduled For</p>
                            <p className="text-2xl font-bold text-white">
                                {new Date(activeRide.scheduledDate).toLocaleDateString("en-GB", { day: 'numeric', month: 'short' })}
                                <span className="mx-2 text-gray-500">|</span>
                                <span className="text-yellow-400 font-black text-4xl drop-shadow-md animate-pulse">
                                    {activeRide.scheduledTime}
                                </span>
                            </p>
                        </div>

                        {/* Driver Details (Minimal) */}
                        <div className="mt-2 text-sm text-gray-400">
                            Assigned Driver: <span className="text-white font-bold">{activeRide.driverName}</span> ({activeRide.vehicleNumber})
                        </div>

                        {/* Cancel Button Removed for Confirmed Rides as per policy */}
                    </div>

                </div>
            );
        }

        return (
            <div className="space-y-6 animate-fade-in">
                <div className="bg-green-900/20 border border-green-500/50 p-6 rounded-2xl text-center">
                    <h2 className="text-2xl font-bold text-green-400 mb-2">Ride in Progress 🛺</h2>
                    <p className="text-gray-300">Heading to <span className="text-white font-bold">{activeRide.drop}</span></p>
                    <div className="flex justify-center gap-4 mt-4 mb-2">
                        <span className="bg-gray-800 px-3 py-1 rounded text-sm text-gray-400">Token: <span className="text-white font-bold">{activeRide.tokenNumber}</span></span>
                        <span className="bg-gray-800 px-3 py-1 rounded text-sm text-gray-400">Vehicle: <span className="text-white font-bold">{activeRide.vehicleNumber || "N/A"}</span></span>
                    </div>

                    {/* Driver Details */}
                    <div className="mt-4 bg-[#111] p-4 rounded-xl border border-gray-700 text-left">
                        <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Driver Details</p>
                        <div className="flex justify-between items-center">
                            <div>
                                <p className="text-white font-bold text-lg">{activeRide.driverName}</p>
                                <p className="text-blue-400 font-mono text-sm">{activeRide.driverPhone}</p>
                            </div>
                            <a href={`tel:${activeRide.driverPhone}`} className="bg-green-600 hover:bg-green-500 text-white p-3 rounded-full shadow-lg transition-transform active:scale-95 cursor-pointer">
                                📞
                            </a>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <QuizComponent isActive={true} />
                    <div className="space-y-6">
                        <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800">
                            <h3 className="text-lg font-bold text-white mb-4">Ride Controls</h3>
                            <button
                                onClick={handleEndRide}
                                className="w-full bg-gray-800 hover:bg-gray-700 text-white font-bold py-4 rounded-xl border border-gray-700 transition-all shadow-lg active:scale-95"
                            >
                                Complete Ride
                            </button>
                        </div>
                        <SOSButton rideDetails={activeRide} />
                    </div>
                </div>
            </div>
        );
    }


    // Main Dashboard Render
    return (
        <div className="space-y-6 relative">
            {/* Toast Notification */}
            {toast && <NotificationToast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            {/* Voice Agent */}
            <VoiceBookingAgent
                onBookingParsed={handleVoiceParsed}
                savedAddresses={userProfile?.savedAddresses || []}
            />

            {/* Voice Confirmation Modal */}
            {showVoiceModal && voiceData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
                    <div className="bg-gray-900 w-full max-w-sm rounded-2xl border border-gray-700 p-6 shadow-2xl relative">
                        <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-blue-600 p-4 rounded-full border-4 border-black shadow-xl">
                            <span className="text-3xl">🎙️</span>
                        </div>

                        <div className="mt-8 text-center">
                            <h2 className="text-xl font-bold text-white mb-1">Confirm Voice Booking</h2>
                            <p className="text-gray-400 text-sm mb-4">"{voiceData.originalTranscript}"</p>

                            <div className="bg-gray-800 rounded-xl p-4 text-left space-y-3 mb-6">
                                <div>
                                    <p className="text-xs text-gray-500 uppercase font-bold">Pickup</p>
                                    <p className="text-white font-semibold">{voiceData.pickup}</p>
                                </div>
                                <div className="border-t border-gray-700 pt-2">
                                    <p className="text-xs text-gray-500 uppercase font-bold">Drop</p>
                                    <p className="text-white font-semibold">{voiceData.drop}</p>
                                </div>
                                {voiceData.rideType === "scheduled" && (
                                    <div className="border-t border-gray-700 pt-2">
                                        <p className="text-xs text-gray-500 uppercase font-bold">Schedule</p>
                                        <p className="text-yellow-400 font-semibold">{voiceData.scheduledTime}</p>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowVoiceModal(false)}
                                    className="flex-1 py-3 rounded-xl bg-gray-800 text-gray-300 font-bold hover:bg-gray-700"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmVoiceBooking}
                                    className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 shadow-lg shadow-blue-900/20"
                                >
                                    Confirm & Book
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Profile Modal */}
            {showEditProfile && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
                    <div className="bg-gray-900 w-full max-w-lg rounded-2xl border border-gray-800 p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-white">Edit Profile ✏️</h2>
                            <button onClick={() => setShowEditProfile(false)} className="text-gray-400 hover:text-white">✕</button>
                        </div>
                        <p className="text-sm text-gray-400 mb-4 bg-blue-900/20 border border-blue-500/30 p-3 rounded-lg">
                            ℹ️ Please enter your actual Home Address and College Name to enable specific routing features.
                        </p>
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

                            {/* College Name with Autocomplete */}
                            <div className="relative">
                                <label className="block text-sm text-gray-400 mb-1">College Name</label>
                                <input type="text" className="w-full bg-gray-800 rounded-lg p-3 text-white border border-gray-700"
                                    value={editFormData.collegeName}
                                    onChange={e => {
                                        setEditFormData({ ...editFormData, collegeName: e.target.value });
                                        setActiveField("collegeName");
                                    }}
                                    onFocus={() => setActiveField("collegeName")}
                                />
                                {activeField === "collegeName" && suggestions.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 bg-gray-800 border border-gray-700 rounded-lg mt-1 z-[70] shadow-xl max-h-40 overflow-y-auto">
                                        {suggestions.map((s, i) => (
                                            <div key={i} onClick={() => handleSelectSuggestion(s)} className="p-3 hover:bg-gray-700 cursor-pointer text-sm text-gray-300 border-b border-gray-700/50">
                                                {s.display_name}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Home Address with Autocomplete */}
                            <div className="relative">
                                <label className="block text-sm text-gray-400 mb-1">Home Address</label>
                                <input type="text" className="w-full bg-gray-800 rounded-lg p-3 text-white border border-gray-700"
                                    value={editFormData.homeAddress}
                                    onChange={e => {
                                        setEditFormData({ ...editFormData, homeAddress: e.target.value });
                                        setActiveField("homeAddress");
                                    }}
                                    onFocus={() => setActiveField("homeAddress")}
                                />
                                {activeField === "homeAddress" && suggestions.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 bg-gray-800 border border-gray-700 rounded-lg mt-1 z-[70] shadow-xl max-h-40 overflow-y-auto">
                                        {suggestions.map((s, i) => (
                                            <div key={i} onClick={() => handleSelectSuggestion(s)} className="p-3 hover:bg-gray-700 cursor-pointer text-sm text-gray-300 border-b border-gray-700/50">
                                                {s.display_name}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <p className="text-xs text-gray-500 mt-1">Enter your exact home location.</p>
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
                                Save Profile
                            </button>
                        </form>
                    </div>
                </div>
            )}


            {/* Save Address Modal */}
            {showSaveAddressModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
                    <div className="bg-gray-900 w-full max-w-md rounded-2xl border border-gray-800 p-6 space-y-4 shadow-2xl min-h-[400px]">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-xl font-bold text-white">
                                {addressModalView === "list" ? "Saved Addresses" : "Add New Address"}
                            </h3>
                            <button onClick={() => setShowSaveAddressModal(false)} className="text-gray-400 hover:text-white">✕</button>
                        </div>

                        {addressModalView === "list" ? (
                            /* LIST VIEW */
                            <div className="space-y-4">
                                <button
                                    onClick={() => setAddressModalView("add")}
                                    className="w-full bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 font-bold py-3 rounded-xl border border-blue-500/30 flex items-center justify-center gap-2 transition-all"
                                >
                                    <span>+</span> Add Address
                                </button>

                                <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar">
                                    {savedAddresses.length === 0 ? (
                                        <p className="text-center text-gray-500 py-8">No saved addresses yet.</p>
                                    ) : (
                                        savedAddresses.map((addr, i) => (
                                            <div key={i} className="bg-[#111] p-4 rounded-xl border border-gray-800 flex justify-between items-center group">
                                                <div>
                                                    <p className="font-bold text-white text-sm mb-0.5">{addr.name}</p>
                                                    <p className="text-xs text-gray-400 truncate max-w-[200px]">{addr.address}</p>
                                                </div>
                                                <button
                                                    onClick={() => handleDeleteAddress(i)}
                                                    className={`p-2 transition-all rounded-lg text-xs font-bold ${deletingIndex === i ? "bg-red-600 text-white" : "text-gray-600 hover:text-red-500"}`}
                                                    title="Delete Address"
                                                >
                                                    {deletingIndex === i ? "CONFIRM?" : "🗑️"}
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        ) : (
                            /* ADD FORM VIEW */
                            <div className="animate-fade-in">
                                <button
                                    onClick={() => setAddressModalView("list")}
                                    className="text-sm text-gray-400 hover:text-white mb-4 flex items-center gap-1"
                                >
                                    ← Back to List
                                </button>

                                <div className="space-y-4">
                                    {/* Address Type */}
                                    <div>
                                        <label className="block text-sm text-gray-400 mb-1">Address Type</label>
                                        <select
                                            value={newAddress.type}
                                            onChange={(e) => setNewAddress({ ...newAddress, type: e.target.value })}
                                            className="w-full bg-gray-800 p-3 rounded-xl text-white border border-gray-700 focus:border-blue-500 outline-none"
                                        >
                                            <option value="Home">Home</option>
                                            <option value="Hostel">Hostel</option>
                                            <option value="Relative">Relative</option>
                                            <option value="Other">Other</option>
                                        </select>
                                    </div>

                                    {/* Custom Name (Only if Other) */}
                                    {newAddress.type === "Other" && (
                                        <div className="animate-fade-in">
                                            <label className="block text-sm text-gray-400 mb-1">Address Type Name</label>
                                            <input
                                                type="text"
                                                placeholder="e.g., Office, Friend's Place"
                                                className="w-full bg-gray-800 p-3 rounded-xl text-white border border-gray-700 focus:border-blue-500 outline-none"
                                                value={newAddress.customName}
                                                onChange={(e) => setNewAddress({ ...newAddress, customName: e.target.value })}
                                            />
                                        </div>
                                    )}

                                    {/* Address Input */}
                                    <div className="relative">
                                        <label className="block text-sm text-gray-400 mb-1">Address <span className="text-red-500">*</span></label>
                                        <input
                                            type="text"
                                            placeholder="Enter full address"
                                            className="w-full bg-gray-800 p-3 rounded-xl text-white border border-gray-700 focus:border-blue-500 outline-none"
                                            value={newAddress.address}
                                            onChange={(e) => {
                                                setNewAddress({ ...newAddress, address: e.target.value });
                                                setActiveField("newAddress");
                                            }}
                                            onFocus={() => setActiveField("newAddress")}
                                        />
                                        {/* Suggestions Overlay in Modal */}
                                        {suggestions.length > 0 && newAddress.address.length > 2 && (
                                            <div className="absolute top-full left-0 right-0 bg-gray-800 border border-gray-700 rounded-lg mt-1 z-50 shadow-xl max-h-40 overflow-y-auto">
                                                {suggestions.map((s, i) => (
                                                    <div key={i}
                                                        onClick={() => {
                                                            const lat = parseFloat(s.lat);
                                                            const lon = parseFloat(s.lon);
                                                            setNewAddress({
                                                                ...newAddress,
                                                                address: s.display_name,
                                                                lat: isNaN(lat) ? 0 : lat,
                                                                lng: isNaN(lon) ? 0 : lon
                                                            });
                                                            setSuggestions([]);
                                                        }}
                                                        className="p-3 hover:bg-gray-700 cursor-pointer text-sm text-gray-300 border-b border-gray-700/50"
                                                    >
                                                        {s.display_name}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Landmark */}
                                    <div>
                                        <label className="block text-sm text-gray-400 mb-1">Landmark (Optional)</label>
                                        <input
                                            type="text"
                                            placeholder="Nearby landmark"
                                            className="w-full bg-gray-800 p-3 rounded-xl text-white border border-gray-700 focus:border-blue-500 outline-none"
                                            value={newAddress.landmark}
                                            onChange={(e) => setNewAddress({ ...newAddress, landmark: e.target.value })}
                                        />
                                    </div>

                                    <button onClick={handleSaveAddress} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl mt-2 transition-all">
                                        Save Address
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Wallet Modal */}
            {showWallet && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
                    <div className="bg-gray-900 w-full max-w-lg rounded-2xl border border-gray-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-white">
                                {walletView === "credits" ? "Buy Credits 🪙" : "Subscriptions 📅"}
                            </h2>
                            <button onClick={() => setShowWallet(false)} className="text-gray-400 hover:text-white">✕</button>
                        </div>

                        {/* Tab Switcher */}
                        <div className="flex p-2 bg-gray-800 mx-6 mt-6 rounded-xl">
                            <button
                                onClick={() => setWalletView("credits")}
                                className={`flex-1 py-2 rounded-lg font-bold transition-all ${walletView === "credits" ? "bg-gray-700 text-white shadow" : "text-gray-400 hover:text-white"}`}
                            >
                                Credits
                            </button>
                            <button
                                onClick={() => setWalletView("subscription")}
                                className={`flex-1 py-2 rounded-lg font-bold transition-all ${walletView === "subscription" ? "bg-gray-700 text-white shadow" : "text-gray-400 hover:text-white"}`}
                            >
                                Subscriptions
                            </button>
                        </div>

                        <div className="p-6 space-y-6 overflow-y-auto">
                            {walletView === "credits" ? (
                                <div>
                                    <div className="bg-gray-800 p-4 rounded-xl text-center mb-6">
                                        <p className="text-gray-400 text-xs uppercase mb-1">Current Balance</p>
                                        <p className="text-3xl font-bold text-yellow-400">{credits}</p>
                                    </div>
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
                            ) : (
                                <div>
                                    <div className="bg-gray-800 p-4 rounded-xl text-center mb-6">
                                        <p className="text-gray-400 text-xs uppercase mb-1">Active Plan</p>
                                        <p className="text-lg font-bold text-blue-400 capitalize">
                                            {subscription?.active ? subscription.type : "None"}
                                        </p>
                                    </div>
                                    <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3">Available Passes</h3>
                                    <div className="space-y-3">
                                        <div onClick={() => handleBuyPass("monthly", 999, 30)} className="bg-gray-800 border border-blue-500/30 p-4 rounded-xl flex justify-between items-center cursor-pointer hover:bg-blue-900/10 transition-colors relative overflow-hidden">
                                            <div className="absolute top-0 right-0 bg-blue-600 text-[10px] px-2 py-0.5 rounded-bl-lg font-bold">BEST VALUE</div>
                                            <div>
                                                <h4 className="font-bold text-white">Monthly Pass</h4>
                                                <p className="text-xs text-gray-400">30 Days Unlimited</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-bold text-blue-400">₹999</p>
                                                <p className="text-[10px] text-gray-500 line-through">₹1200</p>
                                            </div>
                                        </div>
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

            {/* Header / Welcome */}
            <div className="flex justify-between items-center mb-8 pt-4">
                <div>
                    <h1 className="text-3xl font-black bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Welcome, {userProfile?.name?.split(" ")[0]}! 👋</h1>
                    <div className="flex items-center gap-2 mt-1">
                        <p className="text-gray-400 text-sm">Manage your bookings</p>
                        {servingToken && (currentBookingId || activeRide) && (
                            <span className="bg-yellow-500/20 text-yellow-500 text-xs font-bold px-2 py-0.5 rounded border border-yellow-500/30 animate-pulse">
                                Now Serving: Token #{servingToken}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setActiveTab("home")} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-bold transition-all active:scale-95 shadow-lg shadow-blue-500/20">
                        Dashboard
                    </button>
                    <button
                        onClick={() => setActiveTab("timetable")}
                        className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-2 rounded-lg text-sm font-bold transition-all active:scale-95 border border-gray-700"
                    >
                        Timetable
                    </button>
                    <button
                        onClick={() => setActiveTab('share')}
                        className="bg-green-700 hover:bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-bold transition-all active:scale-95 shadow-lg shadow-green-500/20"
                    >
                        Ride Share
                    </button>
                    {/* Logout Button Restored */}
                    <button
                        onClick={() => logout()}
                        className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-sm font-bold transition-all active:scale-95 shadow-lg shadow-red-500/20"
                    >
                        Logout
                    </button>
                </div>
            </div>

            {/* DASHBOARD OVERVIEW (HOME) */}
            {activeTab === "home" && (
                <div className="space-y-8 animate-slide-up">
                    <WeatherWidget />

                    {/* Wallet & Credits Cards (Moved Above Quick Actions) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                        {/* Subscription Card */}
                        <div onClick={() => { setWalletView("subscription"); setShowWallet(true); }} className="bg-gradient-to-br from-gray-900 to-gray-800 p-6 rounded-3xl border border-gray-700 relative overflow-hidden group cursor-pointer hover:border-blue-500/50 transition-all">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <span className="text-6xl">💳</span>
                            </div>
                            <p className="text-gray-400 text-xs font-bold tracking-widest uppercase mb-2">Active Subscription</p>
                            <h3 className="text-3xl font-bold text-white mb-1 capitalize">{subscription?.active ? subscription.type : "No Plan"}</h3>
                            <p className="text-gray-400 text-sm">{subscription?.active ? `Expires in ${Math.ceil((new Date(subscription.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days` : "Tap to browse plans"}</p>
                        </div>

                        {/* Credits Card */}
                        <div onClick={() => { setWalletView("credits"); setShowWallet(true); }} className="bg-gradient-to-br from-gray-900 to-gray-800 p-6 rounded-3xl border border-gray-700 relative overflow-hidden group cursor-pointer hover:border-yellow-500/50 transition-all">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <span className="text-6xl">🪙</span>
                            </div>
                            <p className="text-gray-400 text-xs font-bold tracking-widest uppercase mb-2">Available Credits</p>
                            <h3 className="text-4xl font-black text-white mb-1">{credits} <span className="text-lg text-gray-400 font-medium">Credits</span></h3>
                            <p className="text-blue-400 text-sm font-semibold group-hover:underline">Purchase more</p>
                        </div>
                    </div>

                    {/* Quick Actions Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <button onClick={() => setShowBookingModal(true)} className="bg-[#111] hover:bg-gray-800 border border-gray-800 p-6 rounded-2xl flex flex-col items-center justify-center gap-3 transition-all group">
                            <div className="w-12 h-12 bg-blue-900/30 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                                <span className="text-2xl">🗓️</span>
                            </div>
                            <span className="font-semibold text-gray-300 group-hover:text-white">Book Now</span>
                        </button>
                        <button onClick={() => setShowSaveAddressModal(true)} className="bg-[#111] hover:bg-gray-800 border border-gray-800 p-6 rounded-2xl flex flex-col items-center justify-center gap-3 transition-all group">
                            <div className="w-12 h-12 bg-purple-900/30 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                                <span className="text-2xl">🏠</span>
                            </div>
                            <span className="font-semibold text-gray-300 group-hover:text-white">Saved Addresses</span>
                        </button>
                        <button onClick={() => setShowHistory(true)} className="bg-[#111] hover:bg-gray-800 border border-gray-800 p-6 rounded-2xl flex flex-col items-center justify-center gap-3 transition-all group">
                            <div className="w-12 h-12 bg-orange-900/30 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                                <span className="text-2xl">📜</span>
                            </div>
                            <span className="font-semibold text-gray-300 group-hover:text-white">Ride History</span>
                        </button>
                        <button onClick={() => setShowEditProfile(true)} className="bg-[#111] hover:bg-gray-800 border border-gray-800 p-6 rounded-2xl flex flex-col items-center justify-center gap-3 transition-all group">
                            <div className="w-12 h-12 bg-green-900/30 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                                <span className="text-2xl">👤</span>
                            </div>
                            <span className="font-semibold text-gray-300 group-hover:text-white">My Profile</span>
                        </button>
                        <button onClick={() => setShowLostFoundModal(true)} className="bg-[#111] hover:bg-gray-800 border border-gray-800 p-6 rounded-2xl flex flex-col items-center justify-center gap-3 transition-all group col-span-2 md:col-span-1">
                            <div className="w-12 h-12 bg-pink-900/30 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                                <span className="text-2xl">🔍</span>
                            </div>
                            <span className="font-semibold text-gray-300 group-hover:text-white">Lost & Found</span>
                        </button>
                    </div>
                </div >
            )
            }

            {/* BOOKING MODAL */}
            {
                showBookingModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in">
                        <div className="bg-[#0f172a] w-full max-w-2xl rounded-3xl border border-gray-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] relative">
                            {/* Modal Header */}
                            <div className="p-8 border-b border-gray-800 flex justify-between items-start bg-[#1e293b]/50">
                                <div>
                                    <h2 className="text-3xl font-black text-white mb-1">Book a Ride 🛺</h2>
                                    <p className="text-gray-400">Fill in the details to book your auto-rickshaw</p>
                                </div>
                                <button onClick={() => setShowBookingModal(false)} className="bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white w-10 h-10 rounded-full flex items-center justify-center transition-all">✕</button>
                            </div>

                            <div className="p-8 overflow-y-auto custom-scrollbar">
                                {/* Booking Type Toggle */}
                                <label className="block text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">Booking Type</label>
                                <div className="grid grid-cols-2 gap-4 mb-8">
                                    <button
                                        onClick={() => { setRideType("instant"); setIsEmergency(false); }}
                                        className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${rideType === "instant" ? "bg-blue-600/20 border-blue-500 text-white" : "bg-gray-900 border-gray-800 text-gray-500 hover:border-gray-700"}`}
                                    >
                                        <span className="text-2xl">⚡</span>
                                        <span className="font-bold">Instant</span>
                                    </button>
                                    <button
                                        onClick={() => { setRideType("scheduled"); setIsEmergency(false); }}
                                        className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${rideType === "scheduled" ? "bg-blue-600/20 border-blue-500 text-white" : "bg-gray-900 border-gray-800 text-gray-500 hover:border-gray-700"}`}
                                    >
                                        <span className="text-2xl">📅</span>
                                        <span className="font-bold">Scheduled</span>
                                    </button>
                                </div>

                                {/* Emergency Toggle */}
                                <div className="bg-red-900/10 border border-red-500/30 p-4 rounded-xl mb-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="text-red-400 font-bold flex items-center gap-2">🚨 Emergency Mode</h3>
                                            <p className="text-[10px] text-gray-400">
                                                Skip queue • Max 5/month •
                                                <span className={emergencyUsage >= 5 ? "text-red-500 font-bold ml-1" : "text-green-400 font-bold ml-1"}>
                                                    {5 - emergencyUsage} left
                                                </span>
                                            </p>
                                        </div>
                                        <label className={`relative inline-flex items-center ${emergencyUsage >= 5 ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={isEmergency}
                                                disabled={emergencyUsage >= 5}
                                                onChange={(e) => {
                                                    if (emergencyUsage >= 5) return;
                                                    setIsEmergency(e.target.checked);
                                                    setRideType("instant");
                                                }}
                                            />
                                            <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                                        </label>
                                    </div>

                                    {isEmergency && (
                                        <div className="mt-3 animate-fade-in">
                                            <label className="block text-xs text-red-300 mb-1 font-bold">Nature of Emergency</label>
                                            <select
                                                value={emergencyReason}
                                                onChange={(e) => setEmergencyReason(e.target.value)}
                                                className="w-full bg-gray-900 text-white p-3 rounded-lg border border-red-500 outline-none text-sm font-bold shadow-inner"
                                            >
                                                <option value="Medical Emergency" className="bg-gray-900 text-white">Medical Problem 🏥</option>
                                                <option value="Exam Priority" className="bg-gray-900 text-white">Late for Exam 📝</option>
                                                <option value="Family Emergency" className="bg-gray-900 text-white">Family Emergency 🏠</option>
                                            </select>
                                        </div>
                                    )}
                                </div>

                                {/* Scheduled Ride Inputs */}
                                {rideType === "scheduled" && (
                                    <div className="grid grid-cols-2 gap-4 mb-6 animate-fade-in">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-400 mb-2">Date</label>
                                            <input
                                                type="date"
                                                value={scheduledDate}
                                                onChange={(e) => setScheduledDate(e.target.value)}
                                                min={new Date().toISOString().split("T")[0]}
                                                className="w-full bg-[#1e293b] text-white p-3 rounded-xl border border-gray-700 focus:border-blue-500 outline-none"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-400 mb-2">Time</label>
                                            <input
                                                type="time"
                                                value={scheduledTime}
                                                onChange={(e) => setScheduledTime(e.target.value)}
                                                className="w-full bg-[#1e293b] text-white p-3 rounded-xl border border-gray-700 focus:border-blue-500 outline-none"
                                                required
                                            />
                                        </div>
                                    </div>
                                )}

                                <form onSubmit={(e) => {
                                    handleBookRide(e);
                                    setShowBookingModal(false);
                                }} className="space-y-6">

                                    {/* Pickup & Drop */}
                                    <div className="space-y-6">
                                        <div className="relative">
                                            <label className="block text-sm font-bold text-white mb-2">Pickup Location</label>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    value={pickup}
                                                    onChange={(e) => { setPickup(e.target.value); setActiveField("pickup"); }}
                                                    onFocus={() => setActiveField("pickup")}
                                                    className="w-full bg-[#1e293b] text-white p-4 pl-12 rounded-xl border border-gray-700 focus:border-blue-500 outline-none transition-all font-medium"
                                                    placeholder="Select pickup location"
                                                />
                                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">📍</div>
                                            </div>
                                            {/* Suggestions Logic (Reused) */}
                                            {activeField === "pickup" && suggestions.length > 0 && (
                                                <div className="absolute top-full left-0 right-0 bg-gray-800 border border-gray-700 rounded-xl mt-1 z-50 shadow-xl max-h-40 overflow-y-auto">
                                                    {suggestions.map((s, i) => (
                                                        <div key={i} onClick={() => handleSelectSuggestion(s)} className="p-3 hover:bg-gray-700 cursor-pointer text-sm text-gray-300 border-b border-gray-700/50 flex flex-col items-start gap-1">
                                                            {s.isSaved && <span className="font-bold text-white">{s.name}</span>}
                                                            <div className="flex items-center gap-2">
                                                                <span>{s.isSaved ? "⭐" : "📍"}</span>
                                                                <span className={s.isSaved ? "text-gray-400 text-xs" : ""}>{s.display_name}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div className="relative">
                                            <label className="block text-sm font-bold text-white mb-2">Drop Location</label>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    value={drop}
                                                    onChange={(e) => { setDrop(e.target.value); setActiveField("drop"); }}
                                                    onFocus={() => setActiveField("drop")}
                                                    className="w-full bg-[#1e293b] text-white p-4 pl-12 rounded-xl border border-gray-700 focus:border-blue-500 outline-none transition-all font-medium"
                                                    placeholder="Select drop location"
                                                />
                                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🏁</div>
                                            </div>
                                            {/* Suggestions Logic (Reused) */}
                                            {activeField === "drop" && suggestions.length > 0 && (
                                                <div className="absolute top-full left-0 right-0 bg-gray-800 border border-gray-700 rounded-xl mt-1 z-50 shadow-xl max-h-40 overflow-y-auto">
                                                    {suggestions.map((s, i) => (
                                                        <div key={i} onClick={() => handleSelectSuggestion(s)} className="p-3 hover:bg-gray-700 cursor-pointer text-sm text-gray-300 border-b border-gray-700/50 flex flex-col items-start gap-1">
                                                            {s.isSaved && <span className="font-bold text-white">{s.name}</span>}
                                                            <div className="flex items-center gap-2">
                                                                <span>{s.isSaved ? "⭐" : "📍"}</span>
                                                                <span className={s.isSaved ? "text-gray-400 text-xs" : ""}>{s.display_name}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Payment Mode */}
                                    <div>
                                        <label className="block text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">Payment Mode</label>
                                        <div className="grid grid-cols-3 gap-4">
                                            {[
                                                { id: "subscription", icon: "💳", label: "Subscription", desc: "Home ↔ Campus" },
                                                { id: "credits", icon: "🪙", label: "Credits", desc: `${credits} Available` },
                                                { id: "cash", icon: "💵", label: "Cash", desc: "Digital / Cash" },
                                            ].map((mode) => (
                                                <button
                                                    key={mode.id}
                                                    type="button"
                                                    onClick={() => setPaymentMode(mode.id as any)}
                                                    className={`p-4 rounded-2xl border text-center transition-all ${paymentMode === mode.id
                                                        ? "bg-blue-600 border-blue-500 text-white shadow-lg ring-1 ring-blue-400"
                                                        : "bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-600 hover:bg-gray-800"}`}
                                                >
                                                    <div className="text-2xl mb-2">{mode.icon}</div>
                                                    <div className="font-bold text-sm mb-1">{mode.label}</div>
                                                    <div className="text-[10px] opacity-70">{mode.desc}</div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Submit Button */}
                                    <div className="pt-4">
                                        <button
                                            type="submit"
                                            disabled={loading}
                                            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg active:scale-95 disabled:opacity-50"
                                        >
                                            {loading ? "Booking..." : "Book Auto"}
                                        </button>
                                    </div>
                                </form>
                            </div>

                            {/* Footer Actions */}
                            <div className="p-6 border-t border-gray-800 bg-[#1e293b]/50 backdrop-blur flex gap-4">
                                <button
                                    onClick={() => setShowBookingModal(false)}
                                    className="flex-1 py-4 rounded-xl font-bold text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }



            {/* Voice Confirmation Modal */}
            {showVoiceModal && voiceData && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in">
                    <div className="bg-gray-900 w-full max-w-sm rounded-3xl border border-gray-800 p-6 shadow-2xl relative text-center space-y-4">
                        <div className="w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto mb-2 animate-pulse">
                            <span className="text-3xl">🎙️</span>
                        </div>
                        <h2 className="text-xl font-black text-white">Confirm Voice Booking</h2>
                        <p className="text-gray-400 text-sm">" {voiceData.originalTranscript} "</p>

                        <div className="bg-gray-800/50 p-4 rounded-2xl space-y-3 text-left border border-gray-700">
                            <div className="flex justify-between">
                                <span className="text-gray-500 text-xs font-bold uppercase">Pickup</span>
                                <span className="text-white font-bold text-sm text-right break-words max-w-[200px]">{voiceData.pickup || "Current Location"}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500 text-xs font-bold uppercase">Drop</span>
                                <span className="text-white font-bold text-sm text-right break-words max-w-[200px]">{voiceData.drop || "Not specified"}</span>
                            </div>
                            {voiceData.rideType === "scheduled" && (
                                <div className="flex justify-between">
                                    <span className="text-gray-500 text-xs font-bold uppercase">Time</span>
                                    <span className="text-yellow-400 font-bold text-sm">
                                        {voiceData.scheduledTime}
                                    </span>
                                </div>
                            )}
                            <div className="flex justify-between border-t border-gray-700 pt-2 mt-2">
                                <span className="text-gray-500 text-xs font-bold uppercase">Payment</span>
                                <span className="text-green-400 font-bold text-sm uppercase">
                                    {voiceData.paymentMode ? (
                                        voiceData.paymentMode === "credits" ? "Credits 🟡" :
                                            voiceData.paymentMode === "subscription" ? "Subscription 🟣" : "Cash 💵"
                                    ) : (
                                        subscription?.active ? "Subscription 🟣" : credits > 0 ? "Credits 🟡" : "Cash 💵"
                                    )}
                                </span>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-4">
                            <button
                                onClick={() => setShowVoiceModal(false)}
                                className="flex-1 py-3 bg-gray-800 text-gray-400 font-bold rounded-xl hover:bg-gray-700 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmVoiceBooking}
                                className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-500 shadow-lg shadow-blue-500/20 transition-all active:scale-95"
                            >
                                Confirm & Book
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showLostFoundModal && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
                    <div className="bg-gray-900 w-full max-w-lg rounded-2xl border border-gray-800 p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-white">Lost & Found 🔍</h2>
                            <button onClick={() => setShowLostFoundModal(false)} className="text-gray-400 hover:text-white">✕</button>
                        </div>

                        {/* MY REPORTS SECTION */}
                        {myLostReports.length > 0 && (
                            <div className="mb-8 p-4 bg-gray-800/50 rounded-xl border border-gray-700">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">My Reports</h3>
                                <div className="space-y-3">
                                    {myLostReports.map(report => (
                                        <div key={report.id} className="bg-black/40 p-3 rounded-lg border border-gray-700">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="text-white font-bold">{report.itemName}</span>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${report.status === "FOUND_BY_DRIVER" ? "bg-green-500 text-black" :
                                                    report.status === "COLLECTED" ? "bg-gray-600 text-white" :
                                                        report.status === "NOT_FOUND" ? "bg-red-500/20 text-red-400" :
                                                            "bg-blue-500/20 text-blue-400"
                                                    }`}>
                                                    {report.status.replace(/_/g, " ")}
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-500 mb-2 truncate">{report.description}</p>

                                            {/* DRIVER FOUND IT */}
                                            {report.status === "FOUND_BY_DRIVER" && (
                                                <div className="bg-green-900/20 p-2 rounded border border-green-500/30 mb-2">
                                                    <p className="text-green-400 text-xs font-bold">🎉 Driver found it!</p>
                                                    {report.rideDetails?.driverPhone && (
                                                        <a href={`tel:${report.rideDetails.driverPhone}`} className="text-white text-xs underline block mt-1">
                                                            Call Driver: {report.rideDetails.driverPhone}
                                                        </a>
                                                    )}
                                                    <button
                                                        onClick={() => handleCollected(report.id)}
                                                        className="w-full mt-2 bg-green-600 hover:bg-green-500 text-white text-xs font-bold py-2 rounded transition-colors"
                                                    >
                                                        I Received It
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* NEW REPORT FORM */}
                        <div className="border-t border-gray-800 pt-6">
                            <h3 className="text-sm font-bold text-white mb-4">Report New Item</h3>
                            <form onSubmit={handleReportLostItem} className="space-y-4">
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Item Name</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Blue Umbrella, Wallet"
                                        className="w-full bg-gray-800 p-3 rounded-xl text-white border border-gray-700 focus:border-pink-500 outline-none"
                                        value={lostItemName}
                                        onChange={(e) => setLostItemName(e.target.value)}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Description</label>
                                    <textarea
                                        placeholder="Describe the item securely..."
                                        className="w-full bg-gray-800 p-3 rounded-xl text-white border border-gray-700 focus:border-pink-500 outline-none h-24 resize-none"
                                        value={lostItemDesc}
                                        onChange={(e) => setLostItemDesc(e.target.value)}
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Select Ride (Optional)</label>
                                    <select
                                        className="w-full bg-gray-800 p-3 rounded-xl text-white border border-gray-700 focus:border-pink-500 outline-none"
                                        value={selectedLostRide || ""}
                                        onChange={(e) => setSelectedLostRide(e.target.value || null)}
                                    >
                                        <option value="">-- I don't remember --</option>
                                        {history.slice(0, 5).map((ride) => {
                                            const dateStr = new Date(ride.createdAt).toLocaleString("en-GB", {
                                                day: "numeric", month: "short", hour: "numeric", minute: "numeric", hour12: true
                                            });
                                            const shortPickup = ride.pickup?.split(",")[0] || "Unknown";
                                            const shortDrop = ride.drop?.split(",")[0] || "Unknown";
                                            return (
                                                <option key={ride.id} value={ride.id}>
                                                    {dateStr} | {shortPickup} ➝ {shortDrop}
                                                </option>
                                            );
                                        })}
                                    </select>
                                    <p className="text-[10px] text-gray-500 mt-1">Linking to a ride helps identify the driver.</p>
                                </div>

                                <button type="submit" className="w-full bg-pink-600 hover:bg-pink-700 text-white font-bold py-3 rounded-xl mt-4 transition-all shadow-lg shadow-pink-900/20">
                                    Submit Report
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === "share" && <RideSharing />}
            {activeTab === "timetable" && <AutomatedBooking />}
            {/* --- ACTIVE RIDE BOTTOM SECTION --- */}
            {(bookingStatus === "PENDING" || (activeRide && bookingStatus === "CONFIRMED")) && (
                <div className="fixed bottom-0 left-0 right-0 z-40 bg-gray-900 border-t border-gray-800 p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] animate-slide-up">
                    <div className="max-w-4xl mx-auto">

                        {/* PENDING STATE */}
                        {bookingStatus === "PENDING" && (
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="bg-yellow-500/20 p-3 rounded-full animate-pulse">
                                        <span className="text-2xl">🎫</span>
                                    </div>
                                    <div>
                                        <h3 className="text-yellow-500 font-bold">Waiting for Driver...</h3>
                                        {activeRide?.rideType === "scheduled" ? (
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-white">📅 Scheduled for {activeRide.scheduledTime}</span>
                                                <span className="text-xs text-gray-400">Date: {activeRide.scheduledDate}</span>
                                            </div>
                                        ) : (
                                            <p className="text-sm text-gray-400">Token #{myToken} • {paymentMode}</p>
                                        )}
                                    </div>
                                </div>
                                <div className="text-right hidden md:block">
                                    <p className="text-xs text-gray-500">Currently Serving</p>
                                    <p className="font-bold text-white">#{servingToken || "-"}</p>
                                </div>
                                <button
                                    onClick={handleCancelRide}
                                    className="bg-red-900/20 hover:bg-red-900/40 text-red-400 text-xs font-bold px-3 py-2 rounded-lg transition-colors border border-red-500/20"
                                >
                                    Cancel
                                </button>
                            </div>
                        )}

                        {/* CONFIRMED STATE */}
                        {activeRide && bookingStatus === "CONFIRMED" && (
                            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                                <div className="flex items-center gap-4 w-full md:w-auto">
                                    <div className="bg-green-500/20 p-3 rounded-full">
                                        <span className="text-2xl">🛺</span>
                                    </div>
                                    <div>
                                        <h3 className="text-green-400 font-bold">Ride in Progress</h3>
                                        <p className="text-sm text-white font-bold">{activeRide.vehicleNumber || "Please ask driver"}</p>
                                        <span className="text-xs text-gray-400">Driver: {activeRide.driverName}</span>
                                    </div>
                                </div>

                                <div className="flex gap-2 w-full md:w-auto">
                                    <a href={`tel:${activeRide.driverPhone}`} className="flex-1 md:flex-none bg-gray-800 hover:bg-gray-700 text-white text-sm font-bold px-4 py-2 rounded-lg border border-gray-700 text-center">
                                        📞 Call
                                    </a>
                                    <button onClick={handleEndRide} className="flex-1 md:flex-none bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold px-4 py-2 rounded-lg shadow-lg">
                                        End Ride
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Spacer for bottom bar */}
            {(bookingStatus === "PENDING" || (activeRide && bookingStatus === "CONFIRMED")) && <div className="h-24"></div>}

        </div >
    );
}
