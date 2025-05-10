import Subscription from "../models/subscription.model.js";
import SubscriptionHistory from "../models/subscriptionHistory.model.js";
import Reminder from "../models/reminder.model.js";
import User from "../models/user.model.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

// Define reminders based on frequency
const PRE_RENEWAL_REMINDERS = {
    daily: [6, 1], // Hours before renewal (6 hours, 1 hour)
    weekly: [7, 5, 2, 1], // Days before renewal
    monthly: [7, 5, 2, 1], // Days before renewal
    yearly: [7, 5, 2, 1], // Days before renewal
};
const GRACE_PERIOD_REMINDERS = [1, 3, 5]; // Days after renewal (only for non-daily)

const createSubscription = async (req, res, next) => {
    try {
        // Validate frequency
        const validFrequencies = ["daily", "weekly", "monthly", "yearly"];
        if (!validFrequencies.includes(req.body.frequency)) {
            throw new Error(`Invalid frequency: ${req.body.frequency}`);
        }

        // Fetch user's timezone
        const user = await User.findById(req.user._id);
        if (!user) {
            throw new Error("User not found");
        }
        const customerTimezone = user.timezone || "UTC";

        // Validate and set startDate in user's timezone
        let startDate;
        if (req.body.startDate) {
            const parsedDate = dayjs.tz(req.body.startDate, customerTimezone);
            if (!parsedDate.isValid()) {
                throw new Error("Invalid startDate format");
            }
            if (parsedDate.isBefore(dayjs().tz(customerTimezone), "day")) {
                throw new Error("startDate cannot be in the past");
            }
            startDate = parsedDate.startOf("day").toDate(); // Midnight in user's timezone
        } else {
            startDate = dayjs().tz(customerTimezone).startOf("day").toDate();
        }

        // Calculate renewal date based on frequency
        let renewalDate;
        switch (req.body.frequency) {
            case "daily":
                renewalDate = dayjs(startDate).tz(customerTimezone).add(1, "day").startOf("day").toDate();
                break;
            case "weekly":
                renewalDate = dayjs(startDate).tz(customerTimezone).add(1, "week").startOf("day").toDate();
                break;
            case "monthly":
                renewalDate = dayjs(startDate).tz(customerTimezone).add(1, "month").startOf("day").toDate();
                break;
            case "yearly":
                renewalDate = dayjs(startDate).tz(customerTimezone).add(1, "year").startOf("day").toDate();
                break;
            default:
                throw new Error("Invalid frequency");
        }

        const subscription = await Subscription.create({
            ...req.body,
            user_id: req.user._id,
            startDate,
            renewalDate,
            status: "active",
            autoRenew: req.body.autoRenew !== undefined ? req.body.autoRenew : true,
        });

        // Log audit trail
        await SubscriptionHistory.create({
            subscriptionId: subscription._id,
            action: "created",
            details: { startDate, renewalDate, frequency: req.body.frequency, autoRenew: subscription.autoRenew },
        });

        // Schedule reminders in database
        const now = dayjs().tz(customerTimezone);
        const renewalDateTz = dayjs(subscription.renewalDate).tz(customerTimezone);
        const gracePeriodEnd = renewalDateTz.add(7, "day");
        let reminderType = now.isAfter(renewalDateTz) && now.isBefore(gracePeriodEnd) ? "grace-period" : "pre-renewal";
        const remindersToSchedule = reminderType === "pre-renewal"
            ? PRE_RENEWAL_REMINDERS[req.body.frequency]
            : (req.body.frequency !== "daily" ? GRACE_PERIOD_REMINDERS : []); // No grace reminders for daily

        const scheduledReminders = [];
        for (const offset of remindersToSchedule) {
            let reminderDate, reminderLabel;
            if (reminderType === "pre-renewal") {
                if (req.body.frequency === "daily") {
                    // Use hours for daily reminders
                    reminderDate = renewalDateTz.subtract(offset, "hour");
                    reminderLabel = `${offset}-hour-pre-renewal`;
                } else {
                    // Use days for other frequencies
                    reminderDate = renewalDateTz.subtract(offset, "day").startOf("day");
                    reminderLabel = `${offset}-day-pre-renewal`;
                }
            } else {
                // Grace period (only for non-daily)
                reminderDate = renewalDateTz.add(offset, "day").startOf("day");
                reminderLabel = `${offset}-day-grace-period`;
            }

            /*
            Purpose: Only schedule reminders that are in the future (after now in the user’s timezone) to avoid scheduling past or current reminders.
            Example: If now is 2025-05-01T11:00:00.000+01:00 and reminderDate is 2025-05-01T00:00:00.000+01:00, isAfter(now) is false, so this reminder is skipped.
            */
            if (reminderDate.isAfter(now)) {
                const reminder = await Reminder.create({
                    //NB: status-pending is added to the creation here by default
                    subscriptionId: subscription._id,
                    reminderLabel,
                    userEmail: user.email,
                    userName: user.name,
                    reminderType,
                    scheduledAt: reminderDate.utc().toDate(),
                    timezone: customerTimezone,
                });
                scheduledReminders.push({
                    reminderLabel,
                    scheduledAt: reminderDate.toISOString(),
                    reminderId: reminder._id,
                });
                console.log(`Scheduled ${reminderLabel} for ${reminderDate.toISOString()} in ${customerTimezone}`);
            }
        }

        // Log audit trail for reminders
        await SubscriptionHistory.create({
            subscriptionId: subscription._id,
            action: "remindersScheduled",
            details: { reminderType, scheduledReminders },
        });

        res.status(201).json({
            success: true,
            data: {
                subscription,
                scheduledReminders,
            },
        });
    } catch (err) {
        console.error("Error in createSubscription:", err);
        next(err);
    }
};

const renewSubscription = async (req, res, next) => {
    try {
        const { subscriptionId, autoRenew } = req.body;

        const subscription = await Subscription.findById(subscriptionId).populate("user_id", "timezone email name");
        if (!subscription) {
            throw new Error("Subscription not found");
        }

        if (subscription.user_id._id.toString() !== req.user._id.toString()) {
            throw new Error("You are not authorized to renew this subscription");
        }

        // Calculate next renewal date
        const customerTimezone = subscription.user_id.timezone || "UTC";
        let renewalDate = dayjs(subscription.renewalDate).tz(customerTimezone);
        let frequencyUnit;
        switch (subscription.frequency) {
            case "daily":
                frequencyUnit = "day";
                break;
            case "weekly":
                frequencyUnit = "week";
                break;
            case "monthly":
                frequencyUnit = "month";
                break;
            case "yearly":
                frequencyUnit = "year";
                break;
            default:
                throw new Error("Invalid frequency");
        }

        renewalDate = renewalDate.add(1, frequencyUnit).startOf("day");

        // Update subscription
        subscription.renewalDate = renewalDate.toDate(); // Midnight in user's timezone
        subscription.status = "active";
        if (autoRenew !== undefined) {
            subscription.autoRenew = autoRenew;
        }
        await subscription.save();

        // Log audit trail
        await SubscriptionHistory.create({
            subscriptionId: subscription._id,
            action: "renewed",
            details: { newRenewalDate: renewalDate.toDate(), autoRenew: subscription.autoRenew },
        });

        // Schedule reminders in database
        const now = dayjs().tz(customerTimezone);
        const renewalDateTz = renewalDate;
        const gracePeriodEnd = renewalDateTz.add(7, "day");
        let reminderType = now.isAfter(renewalDateTz) && now.isBefore(gracePeriodEnd) ? "grace-period" : "pre-renewal";
        const remindersToSchedule = reminderType === "pre-renewal"
            ? PRE_RENEWAL_REMINDERS[subscription.frequency]
            : (subscription.frequency !== "daily" ? GRACE_PERIOD_REMINDERS : []); // No grace reminders for daily

        const scheduledReminders = [];
        for (const offset of remindersToSchedule) {
            let reminderDate, reminderLabel;
            if (reminderType === "pre-renewal") {
                if (subscription.frequency === "daily") {
                    // Use hours for daily reminders
                    reminderDate = renewalDateTz.subtract(offset, "hour");
                    reminderLabel = `${offset}-hour-pre-renewal`;
                } else {
                    // Use days for other frequencies
                    reminderDate = renewalDateTz.subtract(offset, "day").startOf("day");
                    reminderLabel = `${offset}-day-pre-renewal`;
                }
            } else {
                // Grace period (only for non-daily)
                reminderDate = renewalDateTz.add(offset, "day").startOf("day");
                reminderLabel = `${offset}-day-grace-period`;
            }

            if (reminderDate.isAfter(now)) {
                const reminder = await Reminder.create({
                    subscriptionId: subscription._id,
                    reminderLabel,
                    userEmail: subscription.user_id.email,
                    userName: subscription.user_id.name,
                    reminderType,
                    scheduledAt: reminderDate.utc().toDate(),
                    timezone: customerTimezone,
                });
                scheduledReminders.push({
                    reminderLabel,
                    scheduledAt: reminderDate.toISOString(),
                    reminderId: reminder._id,
                });
                console.log(`Scheduled ${reminderLabel} for ${reminderDate.toISOString()} in ${customerTimezone}`);
            }
        }

        // Log audit trail for reminders
        await SubscriptionHistory.create({
            subscriptionId: subscription._id,
            action: "remindersScheduled",
            details: { reminderType, scheduledReminders },
        });

        res.json({
            success: true,
            data: {
                subscription,
                scheduledReminders,
            },
            message: "Subscription renewed successfully",
        });
    } catch (err) {
        console.error("Error in renewSubscription:", err);
        next(err);
    }
};

const getUserSubscriptions = async (req, res, next) => {
    try {
        if (req.user._id.toString() !== req.params.id) {
            const error = new Error("You are not the owner of this account!!");
            error.status = 401;
            throw error;
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            throw new Error("User not found");
        }
        const customerTimezone = user.timezone || "UTC";

        const subscriptions = await Subscription.find({ user_id: req.params.id });

        // Convert dates to user's timezone
        const formattedSubscriptions = subscriptions.map(sub => ({
            ...sub.toObject(),
            startDate: dayjs(sub.startDate).tz(customerTimezone).format("YYYY-MM-DD"),
            renewalDate: dayjs(sub.renewalDate).tz(customerTimezone).format("YYYY-MM-DD"),
        }));

        res.status(200).json({
            success: true,
            data: formattedSubscriptions,
        });
    } catch (error) {
        next(error);
    }
};

export { createSubscription, renewSubscription, getUserSubscriptions };