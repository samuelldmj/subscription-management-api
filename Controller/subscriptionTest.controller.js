import { SERVER_URL } from "../config/env.js";
import { workFlowClient } from "../config/upstash.js";
import Subscription from "../models/subscription.model.js";
import SubscriptionHistory from "../models/subscriptionHistory.model.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";

dayjs.extend(utc);

const createSubscriptionTest = async (req, res, next) => {
    try {
        // Validate frequency
        const validFrequencies = ["daily", "weekly", "monthly", "yearly"];
        if (!validFrequencies.includes(req.body.frequency)) {
            throw new Error(`Invalid frequency: ${req.body.frequency}`);
        }

        // Validate and set startDate
        let startDate;
        if (req.body.startDate) {
            const parsedDate = dayjs(req.body.startDate);
            if (!parsedDate.isValid()) {
                throw new Error("Invalid startDate format");
            }
            // Ensure startDate is not in the past
            if (parsedDate.isBefore(dayjs().utc(), "day")) {
                throw new Error("startDate cannot be in the past");
            }
            startDate = parsedDate.utc().toDate();
        } else {
            startDate = dayjs().utc().toDate();
        }

        // Calculate renewal date based on frequency
        let renewalDate;
        switch (req.body.frequency) {
            case "daily":
                renewalDate = dayjs(startDate).utc().add(1, "day").toDate();
                break;
            case "weekly":
                renewalDate = dayjs(startDate).utc().add(1, "week").toDate();
                break;
            case "monthly":
                renewalDate = dayjs(startDate).utc().add(1, "month").toDate();
                break;
            case "yearly":
                renewalDate = dayjs(startDate).utc().add(1, "year").toDate();
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

        // Trigger test task (temporary for testing)
        const testResponse = await workFlowClient.trigger({
            url: `${SERVER_URL}/api/v1/test`,
            body: {
                test: "scheduled",
                subscriptionId: subscription._id.toString(),
                triggeredAt: dayjs().utc().toISOString()
            },
            headers: { "Content-Type": "application/json" },
            notBefore: Math.floor(Date.now() / 1000) + 120, // 2 minutes from now
            retries: 3,
        });

        console.log(`Scheduled test task for subscription ${subscription._id} at ${dayjs((Math.floor(Date.now() / 1000) + 120) * 1000).utc().toISOString()} with notBefore: ${Math.floor(Date.now() / 1000) + 120}`);

        res.status(201).json({
            success: true,
            data: {
                subscription,
                testWorkFlowRunId: testResponse.workflowRunId || "pending",
            },
        });
    } catch (err) {
        console.error("Error in createSubscription:", err);
        next(err);
    }
};

const renewSubscriptionTest = async (req, res, next) => {
    try {
        const { subscriptionId, autoRenew } = req.body;

        const subscription = await Subscription.findById(subscriptionId);
        if (!subscription) {
            throw new Error("Subscription not found");
        }

        if (subscription.user_id.toString() !== req.user._id.toString()) {
            throw new Error("You are not authorized to renew this subscription");
        }

        // Calculate next renewal date
        let renewalDate = dayjs(subscription.renewalDate).utc();
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

        renewalDate = renewalDate.add(1, frequencyUnit);

        // Update subscription
        subscription.renewalDate = renewalDate.toDate();
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

        // Trigger test task (temporary for testing)
        const testResponse = await workFlowClient.trigger({
            url: `${SERVER_URL}/api/v1/test`,
            body: {
                test: "scheduled",
                subscriptionId: subscription._id.toString(),
                triggeredAt: dayjs().utc().toISOString()
            },
            headers: { "Content-Type": "application/json" },
            notBefore: Math.floor(Date.now() / 1000) + 120, // 2 minutes from now
            retries: 3,
        });

        console.log(`Scheduled test task for renewed subscription ${subscription._id} at ${dayjs((Math.floor(Date.now() / 1000) + 120) * 1000).utc().toISOString()} with notBefore: ${Math.floor(Date.now() / 1000) + 120}`);

        res.json({
            success: true,
            data: {
                subscription,
                testWorkFlowRunId: testResponse.workflowRunId || "pending",
            },
            message: "Subscription renewed successfully",
        });
    } catch (err) {
        console.error("Error in renewSubscription:", err);
        next(err);
    }
};

const getUserSubscriptionsTest = async (req, res, next) => {
    try {
        if (req.user._id.toString() !== req.params.id) {
            const error = new Error("You are not the owner of this account!!");
            error.status = 401;
            throw error;
        }

        const subscriptions = await Subscription.find({ user_id: req.params.id });

        res.status(200).json({
            success: true,
            data: subscriptions,
        });
    } catch (error) {
        next(error);
    }
};

export { createSubscriptionTest, renewSubscriptionTest, getUserSubscriptionsTest };