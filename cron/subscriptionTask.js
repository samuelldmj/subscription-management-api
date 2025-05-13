import Subscription from "../models/subscription.model.js";
import SubscriptionHistory from "../models/subscriptionHistory.model.js";
import Reminder from "../models/reminder.model.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const PRE_RENEWAL_REMINDERS = {
    daily: [6, 1], // Hours before renewal (6 hours, 1 hour)
    weekly: [7, 5, 2, 1], // Days before renewal
    monthly: [7, 5, 2, 1], // Days before renewal
    yearly: [7, 5, 2, 1], // Days before renewal
};

const GRACE_PERIOD_REMINDERS = [1, 3, 5]; // Grace period reminders (overridden by controller)

/*

Subscription:
startDate: 2025-05-09T00:00:00.000Z.
renewalDate: 2025-05-16T00:00:00.000Z.
Grace period: May 16 to May 23, 2025.
Grace-Period Reminders: May 17, 19, 21, 2025.
Expiration:
On May 24, 2025:
gracePeriodEnd: 2025-05-17T00:00:00.000Z. (may 24 - 7 days)
renewalDate < gracePeriodEnd, so status changes to "expired".

*/

const processSubscriptionTasks = async () => {
    try {
        // Handle expirations
        /*Calculate the date 7 days before now(UTC) (say now 24th may 2025) to
         identify subscriptions whose renewal date is past the 7 - day grace period. */
        const gracePeriodEnd = dayjs().utc().subtract(7, "day").toDate();

        //returns an array of subscriptions object with all the fields
        //since i want to expire them, this mean the status is still active, so i need to look for active status and which there renewal date is 
        const subscriptionsToExpire = await Subscription.find({
            status: "active",
            renewalDate: { $lt: gracePeriodEnd },
            //populate create an user_id object containing tz, email and name
            /*
            populate() allows you to automatically retrieve the actual referenced document(s) and replace the _id
             in your query results with the full data of the referenced document(s).
            */
        }).populate("user_id", "timezone email name");

        /*
        Result of subscriptionToExpire will look like this
        [
  {
    "_id": "645a7e8b1234567890abcdef",
    "status": "active",
    "renewalDate": "2025-05-02T00:00:00.000Z",
    "user_id": {
      "_id": "645a7e11fedcba9876543210",
      "timezone": "Africa/Lagos",
      "email": "user1@example.com",
      "name": "John Doe"
    },
    "__v": 0
  },
  {
    "_id": "645a7f229876543210abcdef",
    "status": "active",
    "renewalDate": "2025-05-01T00:00:00.000Z",
    "user_id": {
      "_id": "645a7f88abcdef1234567890",
      "timezone": "America/New_York",
      "email": "jane.doe@example.com",
      "name": "Jane Doe"
    },
    "__v": 0
  }
]
        */

        for (const subscription of subscriptionsToExpire) {
            subscription.status = "expired";
            await subscription.save();

            await SubscriptionHistory.create({
                subscriptionId: subscription._id,
                action: "expired",
                details: { renewalDate: subscription.renewalDate },
            });
        }

        console.log(`Expired ${subscriptionsToExpire.length} subscriptions`);

        // Handle automatic renewals
        const subscriptionsToRenew = await Subscription.find({
            status: "active",
            autoRenew: true,
            renewalDate: { $lte: dayjs().utc().toDate(), $gte: gracePeriodEnd },
        }).populate("user_id", "timezone email name");

        for (const subscription of subscriptionsToRenew) {
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
            }

            renewalDate = renewalDate.add(1, frequencyUnit).startOf("day");
            subscription.renewalDate = renewalDate.toDate();
            await subscription.save();

            // Log audit trail
            await SubscriptionHistory.create({
                subscriptionId: subscription._id,
                action: "renewed",
                details: { newRenewalDate: renewalDate.toDate(), autoRenew: true },
            });

            // Schedule reminders
            const now = dayjs().tz(customerTimezone);
            const renewalDateTz = renewalDate;
            const gracePeriodEndTz = renewalDateTz.add(7, "day");
            let reminderType = now.isAfter(renewalDateTz) && now.isBefore(gracePeriodEndTz) ? "grace-period" : "pre-renewal";
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

            await SubscriptionHistory.create({
                subscriptionId: subscription._id,
                action: "remindersScheduled",
                details: { reminderType, scheduledReminders },
            });
        }

        console.log(`Auto-renewed ${subscriptionsToRenew.length} subscriptions`);
    } catch (error) {
        console.error("Error processing subscription tasks:", error);
    }
};

export default processSubscriptionTasks;