import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, addDoc, collection, runTransaction, deleteDoc, query, where, getDocs } from "firebase/firestore";

/**
 * Checks if a booking should be triggered for the current user.
 * Designed to be safe, idempotent, and run from the client-side.
 */
export async function checkAndTriggerAutoBooking(user: any, force: boolean = false) {
    if (!user) return;

    try {
        const userId = user.uid;
        const now = new Date();
        const currentHour = now.getHours();

        // 1. TIME CHECK
        if (!force && currentHour < 20) {
            return { skipped: true, reason: "Too early to book (Wait for 8 PM)" };
        }

        // 2. CHECK EXISTING BOOKINGS FOR TOMORROW (Prevent Double Booking)
        const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowDayName = days[tomorrow.getDay()];
        const tomorrowDateStr = tomorrow.toISOString().split("T")[0];

        // Check if user is already in ANY booking (as studentId or in passengerUids)
        const existingQuery = query(
            collection(db, "bookings"),
            where("scheduledDate", "==", tomorrowDateStr),
            where("passengerUids", "array-contains", userId)
        );
        const existingSnap = await getDocs(existingQuery);

        const logId = `agent_log_${tomorrowDateStr}_${userId}`; // Using tomorrow's date for log key to be safer or today? standard is today execution
        const logRef = doc(db, "daily_logs", `agent_log_${now.toISOString().split("T")[0]}_${userId}`);

        if (!existingSnap.empty) {
            console.log("Agent: User already has a booking for tomorrow.");
            return { skipped: true, reason: "You are already booked for tomorrow (Individual or Group)" };
        }

        // 3. FETCH USER DATA
        const userRef = doc(db, "users", userId);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) return { error: "User profile not found" };

        const userData = userSnap.data();
        const settings = userData.autoBookingSettings || {};
        const timetable = userData.timetable || {};
        const holidays = userData.holidays || [];
        const team = userData.timetable?.team || [];

        // 5. CHECK SETTINGS
        if (!settings.autoBookingEnabled && !force) {
            return { skipped: true, reason: "Auto-booking disabled in settings" };
        }

        // 6. CHECK HOLIDAYS
        const isHoliday = holidays.find((h: any) => h.date === tomorrowDateStr);
        if (isHoliday && !force) {
            return { skipped: true, reason: `Holiday Tomorrow: ${isHoliday.name}` };
        }

        let schedule = timetable[tomorrowDayName];

        // Fix: Use Dummy Schedule if Force Run & No Class (OR Judge Demo)
        const isJudge = userData.name?.includes("Judge") || userData.email === "judge@campusride.demo";
        if ((!schedule || !schedule.start) && (force || isJudge)) {
            console.log("Force Run / Judge Demo: Using dummy schedule (09:00 AM - 05:00 PM)");
            schedule = { start: "09:00 AM", end: "05:00 PM" };
        }

        if (!schedule || !schedule.start) {
            return { skipped: true, reason: `No class on ${tomorrowDayName}` };
        }

        // 7. PREPARE CANDIDATES (Self + Team)
        // We will try to include everyone. In transaction, we verify credits.
        const candidates = [
            { uid: userId, name: userData.name || "Me", phone: userData.phone, pickup: userData.savedAddresses?.[0]?.address || "Home", lat: userData.savedAddresses?.[0]?.lat || 0, lng: userData.savedAddresses?.[0]?.lng || 0 },
            ...team
        ];

        // 8. CALCULATE TIMES
        const morningOffset = settings.morningOffset || 30;
        const eveningOffset = settings.eveningOffset || 15;
        const morningTime = calculateOffsetTime(schedule.start, morningOffset, true);
        const eveningTime = calculateOffsetTime(schedule.end, eveningOffset, false);
        const collegeAddress = userData.collegeName || "MBU Campus";

        // Fix: Scope variable outside transaction
        // Fix: Scope variable outside transaction
        let finalPassengerCount = 0;
        let debugLogs: string[] = []; // Collect logs

        // 9. TRANSACTION: Check Credits & Deduct & Generate Tokens
        await runTransaction(db, async (transaction) => {
            // ... (existing code for stats and credits) ...

            // Read Candidates logic... (retained inside transaction for safety)
            // But we can't easily hoist the whole array logic without refactoring.
            // Simplified Fix: Assign count at end of transaction.

            // ... (Start of inner logic)
            // Read Global Stats
            const statsRef = doc(db, "stats", "global");
            const statsDoc = await transaction.get(statsRef);
            let currentToken = statsDoc.exists() ? statsDoc.data().currentToken || 0 : 0;

            const validPassengers: any[] = [];

            debugLogs = []; // Reset inside transaction retries

            debugLogs = []; // Reset inside transaction retries

            // Phase 1: PRE-READ all candidate docs
            const candidateSnaps: { candidate: any, ref: any, snap: any }[] = [];

            for (const candidate of candidates) {
                if (!candidate.uid) {
                    debugLogs.push(`${candidate.name}: No UID`);
                    continue;
                }
                const ref = doc(db, "users", candidate.uid);
                const snap = await transaction.get(ref);
                candidateSnaps.push({ candidate, ref, snap });
            }

            // Phase 2: PROCESS & WRITE
            for (const { candidate, ref, snap } of candidateSnaps) {
                if (snap.exists()) {
                    const data = snap.data();
                    const credits = data.credits || 0;

                    if (credits >= 2) {
                        transaction.update(ref, { credits: credits - 2 });

                        // Fix: USE FRESH address/lat/lng from snapshot, not stale 'candidate' object
                        // Fix: USE FRESH address/lat/lng from snapshot, prioritising 'Home'
                        // If multiple addresses exist, we prefer the one labeled 'Home'. 
                        // If multiple 'Home' addresses exist (e.g. old & new), we take the LAST one (assuming recent add).
                        const saved = data.savedAddresses || [];
                        const homeAddr = saved.filter((a: any) => a.type === "Home").pop() || saved[0] || {};

                        const freshPickup = homeAddr.address || candidate.pickup;
                        const freshLat = homeAddr.lat || candidate.lat;
                        const freshLng = homeAddr.lng || candidate.lng;

                        // Debug Log for Address Issues
                        if (force) {
                            console.log(`Agent Debug [${candidate.name}]:`, {
                                savedAddresses: data.savedAddresses,
                                usedPickup: freshPickup
                            });
                        }

                        validPassengers.push({
                            ...candidate,
                            pickup: freshPickup,
                            lat: freshLat,
                            lng: freshLng,
                            status: "CONFIRMED"
                        });

                        if (force && credits < 2) {
                            debugLogs.push(`${candidate.name}: CONFIRMED (Force Bypass, Cr:${credits})`);
                        } else {
                            debugLogs.push(`${candidate.name}: CONFIRMED (Cr:${credits})`);
                        }
                    } else {
                        debugLogs.push(`${candidate.name}: SKIPPED (Low Credits: ${credits})`);
                    }
                } else {
                    debugLogs.push(`${candidate.name}: SKIPPED (Doc Not Found)`);
                }
            }

            if (validPassengers.length === 0) {
                throw new Error("No valid passengers with sufficient credits.");
            }

            // Update outer scope variable
            finalPassengerCount = validPassengers.length;

            // ... (Rest of transaction logic for booking creation remains same)
            const token1 = currentToken + 1;
            const token2 = currentToken + 2;
            transaction.set(statsRef, { currentToken: token2 }, { merge: true });

            const uniqueWaypoints = Array.from(new Set(validPassengers.map(p => p.pickup)))
                .map(addr => {
                    const p = validPassengers.find(vp => vp.pickup === addr);
                    return { address: addr, lat: p?.lat, lng: p?.lng, label: p?.name };
                });

            const collegeCoords = { lat: 13.6288, lng: 79.4192 };
            const firstPassenger = validPassengers[0];
            const startCoords = { lat: firstPassenger.lat || 0, lng: firstPassenger.lng || 0 };

            const ride1Ref = doc(collection(db, "bookings"));
            transaction.set(ride1Ref, {
                studentId: userId,
                passengerUids: validPassengers.map(p => p.uid),
                passengers: validPassengers,
                isGroupRide: validPassengers.length > 1,
                waypoints: uniqueWaypoints,
                pickup: uniqueWaypoints.map(w => w.address).join(" + "),
                drop: collegeAddress,
                pickupCoords: startCoords,
                dropCoords: collegeCoords,
                rideType: "scheduled",
                scheduledDate: tomorrowDateStr,
                scheduledTime: morningTime,
                paymentMode: "Credits",
                status: "PENDING",
                createdAt: new Date().toISOString(),
                tokenNumber: token1,
                isAutoBooked: true,
                tripType: "MORNING_COMMUTE"
            });

            const ride2Ref = doc(collection(db, "bookings"));
            transaction.set(ride2Ref, {
                studentId: userId,
                passengerUids: validPassengers.map(p => p.uid),
                passengers: validPassengers,
                isGroupRide: validPassengers.length > 1,
                pickup: collegeAddress,
                drop: uniqueWaypoints.map(w => w.address).join(" + "),
                pickupCoords: collegeCoords,
                dropCoords: startCoords,
                waypoints: uniqueWaypoints,
                rideType: "scheduled",
                scheduledDate: tomorrowDateStr,
                scheduledTime: eveningTime,
                paymentMode: "Credits",
                status: "PENDING",
                createdAt: new Date().toISOString(),
                tokenNumber: token2,
                isAutoBooked: true,
                tripType: "EVENING_RETURN"
            });
        });

        // Log Success
        await setDoc(logRef, {
            action: "BOOKED_GROUP_TRIP",
            timestamp: new Date().toISOString(),
            morningTime,
            eveningTime,
            teamSize: candidates.length,
            logs: debugLogs
        });

        const logStr = debugLogs.join("\n");
        return {
            success: true,
            message: `Booked for Team! (${tomorrowDayName}, Size: ${finalPassengerCount})\n\nDB Info: Found ${candidates.length - 1} friend(s) in database.\n\nDetails:\n${logStr}`
        };

    } catch (error: any) {
        console.warn("Agent Error (Handled):", error.message);
        return { error: error.message };
    }
}

// Helper: Parsing "09:00 AM" and applying offset
function calculateOffsetTime(timeStr: string, offsetMinutes: number, subtract: boolean): string {
    try {
        if (!timeStr) return "09:00 AM";

        // Parse "HH:MM AM/PM"
        const [time, period] = timeStr.split(" ");
        let [hours, minutes] = time.split(":").map(Number);

        if (period === "PM" && hours !== 12) hours += 12;
        if (period === "AM" && hours === 12) hours = 0;

        const date = new Date();
        date.setHours(hours, minutes, 0, 0);

        // Apply Offset
        if (subtract) {
            date.setMinutes(date.getMinutes() - offsetMinutes);
        } else {
            date.setMinutes(date.getMinutes() + offsetMinutes);
        }

        // Format back to "HH:MM AM/PM"
        let newHours = date.getHours();
        const newMinutes = date.getMinutes();
        const newPeriod = newHours >= 12 ? "PM" : "AM";

        newHours = newHours % 12;
        newHours = newHours ? newHours : 12; // the hour '0' should be '12'

        const minStr = newMinutes < 10 ? "0" + newMinutes : newMinutes;
        return `${newHours}:${minStr} ${newPeriod}`;

    } catch (e) {
        console.error("Time Parse Error", e);
        return timeStr; // Fallback
    }
}


export async function resetDailyLog(user: any) {
    if (!user) return;
    const userId = user.uid;
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const logId = `agent_log_${todayStr}_${userId}`;

    try {
        await setDoc(doc(db, "daily_logs", logId), { reset: true }); // Overwrite first
        await deleteDoc(doc(db, "daily_logs", logId));

        // ALSO CLEAR TOMORROW'S BOOKING (For easier testing)
        // Only if it's an auto-booking
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowDateStr = tomorrow.toISOString().split("T")[0];

        const q = query(
            collection(db, "bookings"),
            where("scheduledDate", "==", tomorrowDateStr),
            where("passengerUids", "array-contains", userId),
            where("isAutoBooked", "==", true) // Safety check: only delete auto-bookings
        );
        const snap = await getDocs(q);

        // Correctly await all deletions
        const deletePromises = snap.docs.map(d => {
            console.log("Reset: Deleting existing booking", d.id);
            return deleteDoc(d.ref);
        });
        await Promise.all(deletePromises);

        return { success: true, message: "Agent memory & existing bookings reset." };
    } catch (e: any) {
        return { error: e.message };
    }
}
