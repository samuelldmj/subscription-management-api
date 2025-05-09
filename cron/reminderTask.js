// cron/reminderTask.js
import Reminder from "../models/reminder.model.js";
import SubscriptionHistory from "../models/subscriptionHistory.model.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const processReminderTasks = async () => {
    try {
        const now = dayjs().utc();
        const reminders = await Reminder.find({
            status: "pending",
            scheduledAt: { $lte: now.toDate() },
        });

        for (const reminder of reminders) {
            try {
                console.log(`Processing reminder ${reminder.reminderLabel} for subscription ${reminder.subscriptionId} at ${now.toISOString()} in ${reminder.timezone}`);
                let message =
                    reminder.reminderType === "pre-renewal"
                        ? `Reminder: Your subscription is due soon (${reminder.reminderLabel})`
                        : `Your subscription is in grace period. Please renew to continue (${reminder.reminderLabel})`;
                // Placeholder: await sendEmail(reminder.userEmail, `Subscription Reminder`, message);

                reminder.status = "sent";
                await reminder.save();

                await SubscriptionHistory.create({
                    subscriptionId: reminder.subscriptionId,
                    action: "reminderSent",
                    details: {
                        reminderLabel: reminder.reminderLabel,
                        reminderType: reminder.reminderType,
                        userEmail: reminder.userEmail,
                        timezone: reminder.timezone,
                    },
                });
            } catch (error) {
                reminder.status = "failed";
                await reminder.save();
                console.error(`Failed to process reminder ${reminder.reminderLabel}:`, error);
            }
        }

        console.log(`Processed ${reminders.length} reminders`);
    } catch (error) {
        console.error("Error processing reminder tasks:", error);
    }
};

export default processReminderTasks;