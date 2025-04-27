import { SERVER_URL } from "../config/env.js";
import { workFlowClient } from "../config/upstash.js";
import Subscription from "../models/subscription.model.js";
import SubscriptionHistory from "../models/subscriptionHistory.model.js";
import dayjs from "dayjs";

const REMINDERS = [7, 5, 2, 1]; // Pre-renewal reminders
const GRACE_PERIOD_REMINDERS = [1, 3, 5]; // Reminders during 7-day grace period

const sendReminders = async (req, res) => {
    try {
        console.log("Received req.body in sendReminders:", req.body);

        // Handle Upstash workflow payload
        let subscriptionId;
        if (Array.isArray(req.body) && req.body[0]?.body) {
            // Extract and decode the base64-encoded body
            const encodedBody = req.body[0].body;
            const decodedBody = Buffer.from(encodedBody, "base64").toString("utf-8");
            console.log("Decoded body:", decodedBody);

            // Parse the decoded body as JSON
            const parsedBody = JSON.parse(decodedBody);
            subscriptionId = parsedBody.subscriptionId;
        } else {
            // Fallback for direct JSON body (e.g., manual testing)
            subscriptionId = req.body.subscriptionId;
        }

        // Validate subscriptionId
        if (!subscriptionId) {
            console.error("No subscriptionId provided in request body");
            return res.status(400).json({
                success: false,
                message: "subscriptionId is required",
                details: { reqBody: req.body },
            });
        }

        console.log(`Processing reminders for subscriptionId: ${subscriptionId}`);

        // Fetch subscription
        const subscription = await Subscription.findById(subscriptionId).populate("user_id", "name email");
        if (!subscription) {
            console.error(`Subscription ${subscriptionId} not found`);
            return res.status(400).json({
                success: false,
                message: `Subscription ${subscriptionId} not found`,
                details: { subscriptionId },
            });
        }

        if (subscription.status !== "active") {
            console.error(`Subscription ${subscriptionId} is not active, status: ${subscription.status}`);
            return res.status(400).json({
                success: false,
                message: `Subscription ${subscriptionId} is not active`,
                details: { subscriptionId, status: subscription.status },
            });
        }

        const renewalDate = dayjs(subscription.renewalDate);
        const now = dayjs();
        const gracePeriodEnd = renewalDate.add(7, "day"); // 7-day grace period
        let reminderType = "pre-renewal";
        let remindersToSchedule = REMINDERS;

        console.log(`Renewal date: ${renewalDate.toISOString()}, Now: ${now.toISOString()}`);

        // Determine reminder type and schedule
        if (now.isAfter(renewalDate) && now.isBefore(gracePeriodEnd)) {
            reminderType = "grace-period";
            remindersToSchedule = GRACE_PERIOD_REMINDERS;
        } else if (now.isAfter(gracePeriodEnd)) {
            console.error(`Subscription ${subscriptionId} is past grace period, gracePeriodEnd: ${gracePeriodEnd.toISOString()}`);
            return res.status(400).json({
                success: false,
                message: `Subscription ${subscriptionId} is past grace period`,
                details: { subscriptionId, gracePeriodEnd: gracePeriodEnd.toISOString() },
            });
        }

        // Schedule reminders
        const scheduledReminders = [];
        for (const daysOffset of remindersToSchedule) {
            let reminderDate;
            let reminderLabel;

            if (reminderType === "pre-renewal") {
                reminderDate = renewalDate.subtract(daysOffset, "day");
                reminderLabel = `${daysOffset}-day-pre-renewal`;
            } else {
                reminderDate = renewalDate.add(daysOffset, "day");
                reminderLabel = `${daysOffset}-day-grace-period`;
            }

            console.log(`Scheduling ${reminderLabel} for ${reminderDate.toISOString()}`);

            if (reminderDate.isAfter(now)) {
                const response = await workFlowClient.trigger({
                    url: `${SERVER_URL}/api/v1/workflows/subscription/reminder-task`,
                    body: {
                        subscriptionId,
                        reminderLabel,
                        userEmail: subscription.user_id.email,
                        userName: subscription.user_id.name,
                        reminderType,
                    },
                    headers: { "Content-Type": "application/json" },
                    notBefore: Math.floor(reminderDate.valueOf() / 1000),
                    retries: 3,
                });

                scheduledReminders.push({
                    reminderLabel,
                    scheduledAt: reminderDate.toISOString(),
                    workflowRunId: response.workflowRunId || "pending",
                });
            }
        }

        // Log audit trail
        await SubscriptionHistory.create({
            subscriptionId: subscription._id,
            action: "remindersScheduled",
            details: { reminderType, scheduledReminders },
        });

        res.json({
            success: true,
            message: "Reminders scheduled successfully",
            details: {
                subscriptionId,
                scheduledReminders,
                nextReminder: scheduledReminders.length > 0 ? scheduledReminders[0].reminderLabel : null,
            },
        });
    } catch (error) {
        console.error("Reminder scheduling failed:", error);
        res.status(500).json({
            success: false,
            error: error.message,
            details: {
                subscriptionId: req.body.subscriptionId || "unknown",
                timestamp: new Date().toISOString(),
            },
        });
    }
};

const handleReminderTask = async (req, res) => {
    try {
        let subscriptionId, reminderLabel, userEmail, userName, reminderType;

        // Handle Upstash workflow payload
        if (Array.isArray(req.body) && req.body[0]?.body) {
            const encodedBody = req.body[0].body;
            const decodedBody = Buffer.from(encodedBody, "base64").toString("utf-8");
            console.log("Decoded body in handleReminderTask:", decodedBody);
            const parsedBody = JSON.parse(decodedBody);
            ({ subscriptionId, reminderLabel, userEmail, userName, reminderType } = parsedBody);
        } else {
            // Fallback for direct JSON body
            ({ subscriptionId, reminderLabel, userEmail, userName, reminderType } = req.body);
        }

        // Validate required fields
        if (!subscriptionId || !reminderLabel || !userEmail || !userName || !reminderType) {
            console.error("Missing required fields in handleReminderTask");
            return res.status(400).json({
                success: false,
                message: "Required fields are missing",
                details: { reqBody: req.body },
            });
        }

        const message =
            reminderType === "pre-renewal"
                ? `Reminder: Your subscription is due soon (${reminderLabel})`
                : `Your subscription is in grace period. Please renew to continue (${reminderLabel})`;

        console.log(`Triggering ${reminderLabel} for subscription ${subscriptionId}`);
        console.log(`Sending reminder to ${userName} at ${userEmail}: ${message}`);

        // Placeholder for email/notification logic
        // Example: await sendEmail(userEmail, `Subscription Reminder`, message);

        // Log audit trail
        await SubscriptionHistory.create({
            subscriptionId,
            action: "reminderSent",
            details: { reminderLabel, reminderType, userEmail },
        });

        res.json({
            success: true,
            message: `Reminder ${reminderLabel} triggered successfully`,
            details: { subscriptionId, reminderLabel },
        });
    } catch (error) {
        console.error("Reminder task failed:", error);
        res.status(500).json({
            success: false,
            error: error.message,
            details: { subscriptionId: req.body.subscriptionId || "unknown" },
        });
    }
};

export { sendReminders, handleReminderTask };