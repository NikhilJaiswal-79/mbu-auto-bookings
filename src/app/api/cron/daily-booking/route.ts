import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic'; // Ensure function runs dynamically

export async function GET(req: Request) {
    try {
        // 1. Verify Vercel Cron Signature (Optional for security, skipping for prototype)
        // const authHeader = req.headers.get('authorization');
        // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) { ... }

        console.log("🤖 Auto-Booking Agent Started...");

        // 2. Calculate "Tomorrow"
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayName = days[tomorrow.getDay()];
        const dateString = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD

        console.log(`Analyzing for: ${dayName}, ${dateString}`);

        // 3. Fetch All Users
        const usersSnapshot = await dbAdmin.collection('users').get();
        const bookingsMade: any[] = [];

        // 4. Process Each User
        for (const doc of usersSnapshot.docs) {
            const user = doc.data();
            const userId = doc.id;

            // Check 1: Is Tomorrow a Holiday?
            const isHoliday = user.holidays && user.holidays.some((h: any) => h.date === dateString);
            if (isHoliday) {
                console.log(`Skipping ${userId}: Holiday tomorrow.`);
                continue;
            }

            // Check 2: Does User have a Class?
            const schedule = user.timetable ? user.timetable[dayName] : null;
            if (!schedule || !schedule.start) {
                console.log(`Skipping ${userId}: No classes on ${dayName}.`);
                continue;
            }

            // Check 3: Is a ride already booked for tomorrow? (Prevent Duplicates)
            // (Skipping deep check for prototype, assumes Cron runs once)

            // 5. BOOK THE RIDE!
            const tokenNumber = Math.floor(1000 + Math.random() * 9000);

            const newBooking = {
                userId,
                type: "PICKUP",
                pickup: "Hostel", // Default Pickup
                drop: "College Block A", // Default Drop
                time: schedule.start, // 09:00 AM
                status: "CONFIRMED",
                tokenNumber,
                paymentMode: "cash",
                createdAt: new Date().toISOString(),
                date: dateString, // Important for indexing
                isAutoBooked: true
            };

            await dbAdmin.collection('bookings').add(newBooking);
            bookingsMade.push({ userId, token: tokenNumber });
            console.log(`✅ Booked for ${userId}: Token ${tokenNumber} at ${schedule.start}`);
        }

        return NextResponse.json({
            success: true,
            date: dateString,
            bookingsCount: bookingsMade.length,
            bookings: bookingsMade
        });

    } catch (error: any) {
        console.error("Agent Failed:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
