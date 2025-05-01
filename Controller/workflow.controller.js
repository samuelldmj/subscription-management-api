
import { SERVER_URL } from "../config/env.js";
import { workFlowClient } from "../config/upstash.js";
import Subscription from "../models/subscription.model.js";
import SubscriptionHistory from "../models/subscriptionHistory.model.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const REMINDERS = [7, 5, 2, 1];
const GRACE_PERIOD_REMINDERS = [1, 3, 5];

const sendReminders = async (req, res) => {
    try {
        console.log("Received req.body in sendReminders:", req.body);

        let subscriptionId;
        if (Array.isArray(req.body) && req.body[0]?.body) {
            const encodedBody = req.body[0].body;
            const decodedBody = Buffer.from(encodedBody, "base64").toString("utf-8");
            // console.log("Decoded body:", decodedBody);
            const parsedBody = JSON.parse(decodedBody);
            subscriptionId = parsedBody.subscriptionId;
        } else {
            subscriptionId = req.body.subscriptionId;
        }

        if (!subscriptionId) {
            console.error("No subscriptionId provided");
            return res.status(400).json({
                success: false,
                message: "subscriptionId is required",
                details: { reqBody: req.body },
            });
        }

        const subscription = await Subscription.findById(subscriptionId).populate("user_id", "name email timezone");
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

        const customerTimezone = subscription.user_id.timezone || "UTC";
        const renewalDate = dayjs(subscription.renewalDate).tz(customerTimezone);
        const now = dayjs().tz(customerTimezone);
        const gracePeriodEnd = renewalDate.add(7, "day");
        let reminderType = "pre-renewal";
        let remindersToSchedule = REMINDERS;

        console.log(`Timezone: ${customerTimezone}, Renewal date: ${renewalDate.toISOString()}, Now: ${now.toISOString()}`);

        if (now.isAfter(renewalDate) && now.isBefore(gracePeriodEnd)) {
            reminderType = "grace-period";
            remindersToSchedule = GRACE_PERIOD_REMINDERS;
        } else if (now.isAfter(gracePeriodEnd)) {
            console.error(`Subscription ${subscriptionId} is past grace period`);
            return res.status(400).json({
                success: false,
                message: `Subscription ${subscriptionId} is past grace period`,
                details: { subscriptionId, gracePeriodEnd: gracePeriodEnd.toISOString() },
            });
        }

        const scheduledReminders = [];
        for (const daysOffset of remindersToSchedule) {
            let reminderDate, reminderLabel;

            if (reminderType === "pre-renewal") {
                reminderDate = renewalDate.subtract(daysOffset, "day").startOf("day");
                reminderLabel = `${daysOffset}-day-pre-renewal`;
            } else {
                reminderDate = renewalDate.add(daysOffset, "day").startOf("day");
                reminderLabel = `${daysOffset}-day-grace-period`;
            }

            if (reminderDate.isAfter(now)) {
                const notBefore = Math.floor(reminderDate.valueOf() / 1000);
                const nowUnix = Math.floor(now.valueOf() / 1000);

                if (notBefore <= nowUnix) {
                    console.warn(`Skipping ${reminderLabel}: notBefore (${notBefore}) is not in the future`);
                    continue;
                }

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
                    notBefore,
                    retries: 3,
                });

                console.log(`Scheduled ${reminderLabel} for ${reminderDate.toISOString()} (notBefore: ${notBefore}, workflowRunId: ${response.workflowRunId || "pending"})`);

                scheduledReminders.push({
                    reminderLabel,
                    scheduledAt: reminderDate.toISOString(),
                    workflowRunId: response.workflowRunId || "pending",
                });
            }
        }

        // Log QStash workflow runs
        const { runs } = await workFlowClient.logs();
        console.log("QStash workflow runs:", runs);

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

        if (Array.isArray(req.body) && req.body[0]?.body) {
            const encodedBody = req.body[0].body;
            const decodedBody = Buffer.from(encodedBody, "base64").toString("utf-8");
            console.log("Decoded body in handleReminderTask:", decodedBody);
            const parsedBody = JSON.parse(decodedBody);
            ({ subscriptionId, reminderLabel, userEmail, userName, reminderType } = parsedBody);
        } else {
            ({ subscriptionId, reminderLabel, userEmail, userName, reminderType } = req.body);
        }

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