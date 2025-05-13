import Reminder from "../models/reminder.model.js";
import Subscription from "../models/subscription.model.js";
import SubscriptionHistory from "../models/subscriptionHistory.model.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { generateEmailTemplate } from "../misc/emailTemplate.js";
import sendEmail from "../misc/sendEmail.js";

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
                // Fetch subscription details
                const subscription = await Subscription.findById(reminder.subscriptionId);
                if (!subscription) {
                    throw new Error(`Subscription ${reminder.subscriptionId} not found`);
                }

                // Generate email content
                const { subject, html } = generateEmailTemplate({
                    userName: reminder.userName,
                    subscriptionName: subscription.name,
                    renewalDate: subscription.renewalDate,
                    reminderLabel: reminder.reminderLabel,
                    reminderType: reminder.reminderType,
                    customerTimezone: reminder.timezone,
                });

                // Send email
                await sendEmail(reminder.userEmail, subject, html);

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

                console.log(`Processed reminder ${reminder.reminderLabel} for subscription ${reminder.subscriptionId} at ${now.toISOString()} in ${reminder.timezone}`);
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