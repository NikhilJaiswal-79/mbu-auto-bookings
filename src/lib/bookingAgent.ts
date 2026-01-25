import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, addDoc, collection, runTransaction, deleteDoc } from "firebase/firestore";

/**
 * Checks if a booking should be triggered for the current user.
 * Designed to be safe, idempotent, and run from the client-side.
 */
export async function checkAndTriggerAutoBooking(user: any) {
    if (!user) return;

    try {
        const userId = user.uid;
        const now = new Date();
        const currentHour = now.getHours(); // 0-23

        // 1. TIME CHECK: Only run after 8 PM (20:00)
        // For testing, we might want to bypass this, but for production logic:
        // if (currentHour < 20) {
        //     console.log("Agent: Too early to book. Waiting for 8 PM.");
        //     return { skipped: true, reason: "Too early (Wait for 8 PM)" };
        // }
        // (Commented out strict check for easier testing by user, or we can uncomment for prod)
        if (currentHour < 20) {
            // We can return skipped, but maybe user wants to force run?
            // Let's keep it strict for the "Automatic" part, but the Force Run button bypasses this?
            // Actually, the Force Run button calls this same function. 
            // Let's check if we are in "Force Mode" or just check time. 
            // For now, let's keep the check but assume the user might click "Force Run" earlier.
            // We'll rely on the caller to handle "Force Run" vs "Auto Run". 
            // IF this is auto-run (useEffect), checking time is good. 
            // BUT we don't have a flag here.
            // Let's just return skipped if < 20, but the Force Run button might need a wrapper.
            // Actually, for simplicity, we will STRICTLY enforce 8 PM for now.
            return { skipped: true, reason: "Too early to book (Wait for 8 PM)" };
        }

        // 2. FREQUENCY CHECK: Check if we already booked for *tomorrow* today.
        // Log ID format: "YYYY-MM-DD-{userId}" where Date is TODAY's date (the day we ran the agent)
        const todayStr = now.toISOString().split("T")[0];
        const logId = `agent_log_${todayStr}_${userId}`;
        const logRef = doc(db, "daily_logs", logId);
        const logSnap = await getDoc(logRef);

        if (logSnap.exists()) {
            console.log("Agent: Already ran today.");
            return { skipped: true, reason: "Already booked today" };
        }

        // 3. FETCH USER DATA (Profile, Timetable, Settings, Holidays)
        const userRef = doc(db, "users", userId);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) return { error: "User profile not found" };

        const userData = userSnap.data();
        const settings = userData.autoBookingSettings || {};
        const timetable = userData.timetable || {};
        const holidays = userData.holidays || [];

        // 4. CHECK SETTINGS
        if (!settings.autoBookingEnabled) {
            return { skipped: true, reason: "Auto-booking disabled in settings" };
        }

        // 5. DETERMINE TOMORROW'S SCHEDULE
        const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowDayName = days[tomorrow.getDay()];
        const tomorrowDateStr = tomorrow.toISOString().split("T")[0]; // YYYY-MM-DD

        // 6. CHECK HOLIDAYS
        const isHoliday = holidays.find((h: any) => h.date === tomorrowDateStr);
        if (isHoliday) {
            await setDoc(logRef, {
                action: "SKIPPED",
                reason: "Holiday: " + isHoliday.name,
                timestamp: new Date().toISOString()
            });
            return { skipped: true, reason: `Holiday Tomorrow: ${isHoliday.name}` };
        }

        const schedule = timetable[tomorrowDayName];

        if (!schedule || !schedule.start) {
            await setDoc(logRef, {
                action: "SKIPPED",
                reason: "No class tomorrow",
                timestamp: new Date().toISOString()
            });
            return { skipped: true, reason: `No class on ${tomorrowDayName}` };
        }

        // 7. PREPARE RIDE DETAILS
        // Default Pickup: "Home" or First Saved Address
        let homeAddress = "My Home";
        if (userData.savedAddresses && userData.savedAddresses.length > 0) {
            // Try to find one named "Home"
            const homeAddr = userData.savedAddresses.find((a: any) => a.name.toLowerCase().includes("home"));
            homeAddress = homeAddr ? homeAddr.address : userData.savedAddresses[0].address;
        }

        const collegeAddress = userData.collegeName || "MBU Campus";

        // 8. CALCULATE TIMES WITH OFFSETS
        // Settings: morningOffset (minutes BEFORE start), eveningOffset (minutes AFTER end)
        const morningOffset = settings.morningOffset || 30; // Default 30 mins before
        const eveningOffset = settings.eveningOffset || 15; // Default 15 mins after

        const morningTime = calculateOffsetTime(schedule.start, morningOffset, true); // Subtract
        const eveningTime = calculateOffsetTime(schedule.end, eveningOffset, false); // Add

        // 9. GENERATE TOKENS (Transaction for safety - Need 2 tokens)
        let token1 = 0;
        let token2 = 0;

        await runTransaction(db, async (transaction) => {
            const statsRef = doc(db, "stats", "global");
            const statsDoc = await transaction.get(statsRef);
            let current = 0;
            if (statsDoc.exists()) {
                current = statsDoc.data().currentToken || 0;
            }
            token1 = current + 1;
            token2 = current + 2;
            transaction.set(statsRef, { currentToken: token2 }, { merge: true });
        });

        // 10. CREATE RIDES (Batch or sequential)

        // Ride 1: Home -> College
        const ride1 = {
            studentId: userId,
            studentName: userData.name || "Student",
            studentPhone: userData.phone || "Not Provided",
            pickup: homeAddress,
            drop: collegeAddress,
            rideType: "scheduled",
            scheduledDate: tomorrowDateStr,
            scheduledTime: morningTime,
            paymentMode: settings.defaultPayment || "Cash/Online",
            status: "PENDING",
            createdAt: new Date().toISOString(),
            tokenNumber: token1,
            isAutoBooked: true,
            tripType: "MORNING_COMMUTE"
        };

        // Ride 2: College -> Home
        const ride2 = {
            studentId: userId,
            studentName: userData.name || "Student",
            studentPhone: userData.phone || "Not Provided",
            pickup: collegeAddress, // Reverse direction
            drop: homeAddress,      // Reverse direction
            rideType: "scheduled",
            scheduledDate: tomorrowDateStr,
            scheduledTime: eveningTime,
            paymentMode: settings.defaultPayment || "Cash/Online",
            status: "PENDING",
            createdAt: new Date().toISOString(),
            tokenNumber: token2,
            isAutoBooked: true,
            tripType: "EVENING_RETURN"
        };

        await addDoc(collection(db, "bookings"), ride1);
        await addDoc(collection(db, "bookings"), ride2);

        // 11. LOG SUCCESS
        await setDoc(logRef, {
            action: "BOOKED_ROUND_TRIP",
            timestamp: new Date().toISOString(),
            morningTime,
            eveningTime
        });

        return { success: true, message: `Booked Round Trip for ${tomorrowDayName}! Morning: ${morningTime}, Evening: ${eveningTime}` };

    } catch (error: any) {
        console.error("Agent Error:", error);
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
        return { success: true, message: "Agent memory cleared for today." };
    } catch (e: any) {
        return { error: e.message };
    }
}
