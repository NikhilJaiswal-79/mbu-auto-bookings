import { db } from "./firebase";
import { doc, runTransaction, collection, query, where, orderBy, limit, onSnapshot } from "firebase/firestore";

/**
 * Generates a sequential token number for the current day.
 * Resets to 1 if the day has changed.
 */
export const generateToken = async (): Promise<number> => {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const counterRef = doc(db, "counters", "daily_token");

    try {
        const token = await runTransaction(db, async (transaction) => {
            const docSnapshot = await transaction.get(counterRef);

            let currentCount = 0;
            let lastDate = "";

            if (docSnapshot.exists()) {
                const data = docSnapshot.data();
                currentCount = data.count || 0;
                lastDate = data.date || "";
            }

            let nextCount;
            if (lastDate !== today) {
                // New day, reset counter
                nextCount = 1;
            } else {
                // Same day, increment
                nextCount = currentCount + 1;
            }

            transaction.set(counterRef, {
                count: nextCount,
                date: today
            });

            return nextCount;
        });

        return token;
    } catch (error) {
        console.error("Token generation failed:", error);
        throw error;
    }
};

/**
 * Listens for the "Currently Serving" token (The highest CONFIRMED token number).
 * This represents the ride currently being processed/in-transit.
 */
export const subscribeToServingToken = (callback: (token: number | null) => void) => {
    // SIMPLER APPROACH: Query all CONFIRMED rides and filter client-side.
    // This avoids the "Missing Index" error that is breaking the app.

    const q = query(
        collection(db, "bookings"),
        where("status", "in", ["CONFIRMED", "COMPLETED"])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            callback(null);
            return;
        }

        const todayStr = new Date().toISOString().split('T')[0];

        // Manual Filter: Get Bookings from TODAY with highest token number
        const todaysBookings = snapshot.docs
            .map(doc => doc.data())
            .filter(data => data.createdAt && data.createdAt.startsWith(todayStr))
            .sort((a, b) => b.tokenNumber - a.tokenNumber); // Descending Sort

        if (todaysBookings.length > 0) {
            callback(todaysBookings[0].tokenNumber);
        } else {
            callback(null);
        }
    }, (error) => {
        console.error("Token Subscription Error:", error);
    });

    return unsubscribe;
};
