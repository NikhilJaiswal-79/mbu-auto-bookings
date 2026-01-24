import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

const emailUser = process.env.EMAIL_USER;
const emailPass = process.env.EMAIL_PASS;
const emailFrom = process.env.EMAIL_FROM || '"MBU Safety Team" <no-reply@mbu.edu>';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { studentName, studentPhone, studentEmail, parentPhone, parentEmail, location, rideDetails } = body;

        // Determine Recipient: Use Parent Email if available, otherwise User Email (for testing)
        const recipientEmail = parentEmail || studentEmail;

        if (!emailUser || !emailPass) {
            console.warn("⚠️ Email credentials missing in .env.local.");
            return NextResponse.json({ success: true, message: "SOS Logged (Email Not Configured - check console)" });
        }

        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: emailUser,
                pass: emailPass,
            },
        });

        // Construct Email HTML
        const driverName = rideDetails?.driverName || "Unknown";
        const driverPhone = rideDetails?.driverPhone || "Unknown";
        const vehicleNumber = rideDetails?.vehicleNumber || "Unknown";
        const pickup = rideDetails?.pickup || "Unknown";
        const drop = rideDetails?.drop || "Unknown";

        const htmlContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                <h2 style="color: #d9534f; text-align: center; text-transform: uppercase;">🚨 EMERGENCY ALERT - ${studentName} needs immediate assistance 🚨</h2>
                
                <p>Dear Parent/Guardian,</p>
                
                <p><strong>URGENT:</strong> Your child <strong>${studentName}</strong> has activated an emergency SOS alert during their ride.</p>
                
                <hr style="border: 1px dashed #ccc; margin: 20px 0;">
                
                <h3 style="text-align: center; color: #555;">RIDE DETAILS</h3>
                
                <table style="width: 100%; border-collapse: collapse;">
                    <tr><td style="padding: 8px; font-weight: bold;">Student Name:</td><td style="padding: 8px;">${studentName}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold;">Student Phone:</td><td style="padding: 8px;">${studentPhone}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold;">Driver Name:</td><td style="padding: 8px;">${driverName}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold;">Driver Phone:</td><td style="padding: 8px;">${driverPhone}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold;">Vehicle Number:</td><td style="padding: 8px;">${vehicleNumber}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold;">Pickup Location:</td><td style="padding: 8px;">${pickup}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold;">Drop Location:</td><td style="padding: 8px;">${drop}</td></tr>
                </table>

                <div style="margin: 20px 0; padding: 15px; background-color: #f9f9f9; text-align: center; border-radius: 5px;">
                    <p style="margin: 0; font-size: 16px;"><strong>📍 LIVE LOCATION:</strong></p>
                    <p style="margin: 5px 0;"><a href="${location}" target="_blank" style="color: #007bff; text-decoration: none;">Click here to view live location on Google Maps</a></p>
                </div>

                <hr style="border: 1px dashed #ccc; margin: 20px 0;">

                <h3 style="text-align: center; color: #d9534f;">IMMEDIATE ACTION REQUIRED</h3>
                <ol>
                    <li>Contact your child immediately at <strong>${studentPhone}</strong>.</li>
                    <li>If unable to reach your child, contact the driver at <strong>${driverPhone}</strong>.</li>
                    <li>If the situation is critical, contact local authorities immediately.</li>
                </ol>

                <br>
                <div style="text-align: center; font-size: 12px; color: #999;">
                    <p>MBU Auto Booking Platform - Student Safety Team</p>
                    <p>This is an automated message. Please do not reply.</p>
                </div>
            </div>
        `;

        const mailOptions = {
            from: emailFrom,
            to: recipientEmail,
            subject: `🚨 SOS ALERT: ${studentName} needs help!`,
            html: htmlContent,
            text: `EMERGENCY ALERT: ${studentName} needs help!\n\nLocation: ${location}\n\nRide Details:\nDriver:${driverName}\nVehicle: ${vehicleNumber}\nCall: ${studentPhone}`, // Text fallback
        };

        const info = await transporter.sendMail(mailOptions);
        console.log("✅ SOS Email sent:", info.messageId);

        return NextResponse.json({ success: true, message: "SOS Email Sent Successfully" });

    } catch (error: any) {
        console.error("SOS Email Error:", error);
        return NextResponse.json({ success: false, error: error.message || "Failed to send Email" }, { status: 500 });
    }
}
