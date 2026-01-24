// Placeholder for n8n integration
export async function triggerDailyBooking() {
    const webhookUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL;
    if (!webhookUrl) {
        console.error("n8n Webhook URL is not configured");
        return;
    }

    try {
        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                action: "trigger_daily_booking",
                timestamp: new Date().toISOString(),
            }),
        });

        if (!response.ok) {
            throw new Error(`n8n webhook failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Error triggering n8n booking:", error);
        throw error;
    }
}
