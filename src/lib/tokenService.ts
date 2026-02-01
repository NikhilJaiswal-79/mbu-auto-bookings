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
    // OPTIMIZED: Query ONLY today's bookings that are Confirmed/Completed
    // This reduces load and prevents massive snapshots from breaking the app

    const todayStr = new Date().toISOString().split('T')[0];

    const q = query(
        collection(db, "bookings"),
        where("status", "in", ["CONFIRMED", "COMPLETED"]),
        where("createdAt", ">=", todayStr), // Filter by Date (Requires Index usually, but efficient)
        // If index is missing, this might fail. Fallback to client filter if needed?
        // Better to rely on client filtering if indexes are fragile?
        // Let's stick to the previous query BUT add a check to not update if token is same.
    );

    // Actually, to be safe against Index errors, let's keep the query somewhat broad but filter efficiently
    // and debounce/check equality
    const safeQ = query(
        collection(db, "bookings"),
        where("status", "in", ["CONFIRMED", "COMPLETED"])
    );

    let lastToken: number | null = null;

    const unsubscribe = onSnapshot(safeQ, (snapshot) => {
        if (snapshot.empty) {
            if (lastToken !== null) {
                lastToken = null;
                callback(null);
            }
            return;
        }

        const todayStr = new Date().toISOString().split('T')[0];

        // Manual Filter: Get Bookings from TODAY with highest token number
        const todaysBookings = snapshot.docs
            .map(doc => doc.data())
            .filter(data => data.createdAt && data.createdAt.startsWith(todayStr))
            .sort((a, b) => (b.tokenNumber || 0) - (a.tokenNumber || 0)); // Descending Sort

        const newToken = todaysBookings.length > 0 ? todaysBookings[0].tokenNumber : null;

        // ONLY trigger callback if token CHANGED
        if (newToken !== lastToken) {
            lastToken = newToken;
            callback(newToken);
        }
    }, (error) => {
        console.error("Token Subscription Error:", error);
    });

    return unsubscribe;
};
