import { SERVER_URL } from "../config/env.js";
import { workFlowClient } from "../config/upstash.js";
import Subscription from "../models/subscription.model.js";
import SubscriptionHistory from "../models/subscriptionHistory.model.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";

dayjs.extend(utc);

const handleTestTask = async (req, res) => {
    try {
        let testData;
        if (Array.isArray(req.body) && req.body[0]?.body) {
            const encodedBody = req.body[0].body;
            const decodedBody = Buffer.from(encodedBody, "base64").toString("utf-8");
            console.log("Decoded body in handleTestTask:", decodedBody);
            testData = JSON.parse(decodedBody);
        } else {
            testData = req.body;
        }

        console.log(`Test task triggered at ${dayjs().utc().toISOString()}:`, testData);

        res.json({
            success: true,
            message: "Test task triggered successfully",
            details: testData,
        });
    } catch (error) {
        console.error("Test task failed:", error);
        res.status(500).json({
            success: false,
            error: error.message,
            details: { timestamp: dayjs().utc().toISOString() },
        });
    }
};

// New endpoint to trigger the test task
const triggerTestTask = async (req, res) => {
    try {
        const notBefore = Math.floor(Date.now() / 1000) + 120; // 2 minutes from now
        const response = await workFlowClient.trigger({
            url: `${SERVER_URL}/api/v1/test`,
            body: {
                test: "scheduled",
                triggeredAt: dayjs().utc().toISOString()
            },
            headers: { "Content-Type": "application/json" },
            notBefore,
            retries: 3,
        });

        console.log(`Scheduled test task at ${dayjs(notBefore * 1000).utc().toISOString()} with notBefore: ${notBefore}`);

        res.json({
            success: true,
            message: "Test task scheduled successfully",
            details: {
                workflowRunId: response.workflowRunId || "pending",
                scheduledAt: dayjs(notBefore * 1000).utc().toISOString(),
            },
        });
    } catch (error) {
        console.error("Failed to schedule test task:", error);
        res.status(500).json({
            success: false,
            error: error.message,
            details: { timestamp: dayjs().utc().toISOString() },
        });
    }
};

export { handleTestTask, triggerTestTask };