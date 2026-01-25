
import { NextResponse } from "next/server";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authAdmin } from "@/lib/firebaseAdmin"; // Import Admin Auth

export async function POST() {
    try {
        const results = [];

        // 1. Wipe Firestore Collections
        const collections = ["users", "bookings", "sos_alerts"];
        for (const colName of collections) {
            const querySnapshot = await getDocs(collection(db, colName));
            if (!querySnapshot.empty) {
                const deletePromises = querySnapshot.docs.map(document =>
                    deleteDoc(doc(db, colName, document.id))
                );
                await Promise.all(deletePromises);
                results.push(`${colName}: Deleted ${deletePromises.length} documents.`);
            } else {
                results.push(`${colName}: No documents found.`);
            }
        }

        // 2. Wipe Firebase Auth Users (Requires Admin SDK)
        try {
            const listUsersResult = await authAdmin.listUsers(1000);
            const uids = listUsersResult.users.map((user) => user.uid);

            if (uids.length > 0) {
                await authAdmin.deleteUsers(uids);
                results.push(`Auth: Deleted ${uids.length} users.`);
            } else {
                results.push(`Auth: No users found.`);
            }
        } catch (authError: any) {
            console.error("Auth Wipe Error:", authError);
            results.push(`Auth Wipe Failed: ${authError.message}`);
        }

        return NextResponse.json({ success: true, message: "Full System Wipe Completed", details: results });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
