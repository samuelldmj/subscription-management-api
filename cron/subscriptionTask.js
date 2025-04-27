import Subscription from "../models/subscription.model.js";
import SubscriptionHistory from "../models/subscriptionHistory.model.js";
import { workFlowClient } from "../config/upstash.js";
import { SERVER_URL } from "../config/env.js";
import dayjs from "dayjs";

const processSubscriptionTasks = async () => {
    try {
        // Handle expirations
        const gracePeriodEnd = dayjs().subtract(7, "day").toDate();
        const subscriptionsToExpire = await Subscription.find({
            status: "active",
            renewalDate: { $lt: gracePeriodEnd },
        });

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
            renewalDate: { $lte: dayjs().toDate(), $gte: gracePeriodEnd },
        });

        for (const subscription of subscriptionsToRenew) {
            let renewalDate = dayjs(subscription.renewalDate);
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

            renewalDate = renewalDate.add(1, frequencyUnit);
            subscription.renewalDate = renewalDate.toDate();
            await subscription.save();

            // Log audit trail
            await SubscriptionHistory.create({
                subscriptionId: subscription._id,
                action: "renewed",
                details: { newRenewalDate: renewalDate.toDate(), autoRenew: true },
            });

            // Trigger reminders
            await workFlowClient.trigger({
                url: `${SERVER_URL}/api/v1/workflows/subscription/reminder`,
                body: { subscriptionId: subscription._id },
                headers: { "Content-Type": "application/json" },
                retries: 3,
            });
        }

        console.log(`Auto-renewed ${subscriptionsToRenew.length} subscriptions`);
    } catch (error) {
        console.error("Error processing subscription tasks:", error);
    }
};

export default processSubscriptionTasks;