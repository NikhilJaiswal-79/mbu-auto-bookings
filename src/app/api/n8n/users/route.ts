import { NextResponse } from "next/server";
import { db } from "@/lib/firebase"; // NOTE: This is client SDK. For API routes usually Admin SDK is better but for simple prototypes Client SDK works if rules allow or if we simulate. 
// However, client SDK in node env (API route) works fine for Firestore.
import { collection, getDocs } from "firebase/firestore";

export async function GET() {
    try {
        const usersRef = collection(db, "users");
        const snapshot = await getDocs(usersRef);

        const users = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        return NextResponse.json({ success: true, users });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
