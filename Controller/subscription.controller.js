import { SERVER_URL } from "../config/env.js";
import { workFlowClient } from "../config/upstash.js";
import Subscription from "../models/subscription.model.js";
import SubscriptionHistory from "../models/subscriptionHistory.model.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";

dayjs.extend(utc);

const createSubscription = async (req, res, next) => {
    try {
        // Validating frequency
        // console.log(dayjs().format("Z"));
        const validFrequencies = ["daily", "weekly", "monthly", "yearly"];
        if (!validFrequencies.includes(req.body.frequency)) {
            throw new Error(`Invalid frequency: ${req.body.frequency}`);
        }

        // Validating and setting startDate
        let startDate;
        if (req.body.startDate) {
            const parsedDate = dayjs(req.body.startDate);
            if (!parsedDate.isValid()) {
                throw new Error("Invalid startDate format");
            }
            // Ensuring that startDate is not in the past
            if (parsedDate.isBefore(dayjs().utc(), "day")) {
                throw new Error("startDate cannot be in the past");
            }
            startDate = parsedDate.utc().toDate();
        } else {
            startDate = dayjs().utc().toDate();
        }

        // Calculating renewal date based on frequency
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

        // Trigger reminders
        const response = await workFlowClient.trigger({
            url: `${SERVER_URL}/api/v1/workflows/subscription/reminder`,
            body: { subscriptionId: subscription._id.toString() },
            headers: { "Content-Type": "application/json" },
            retries: 3,
        });

        res.status(201).json({
            success: true,
            data: {
                subscription,
                workFlowRunId: response.workflowRunId || "pending",
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

        const subscription = await Subscription.findById(subscriptionId);
        if (!subscription) {
            throw new Error("Subscription not found");
        }

        if (subscription.user_id.toString() !== req.user._id.toString()) {
            throw new Error("You are not authorized to renew this subscription");
        }

        // Calculate next renewal date
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

        // Trigger reminders
        const response = await workFlowClient.trigger({
            url: `${SERVER_URL}/api/v1/workflows/subscription/reminder`,
            body: { subscriptionId: subscription._id },
            headers: { "Content-Type": "application/json" },
            retries: 3,
        });

        res.json({
            success: true,
            data: {
                subscription,
                workFlowRunId: response.workflowRunId || "pending",
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

        const subscriptions = await Subscription.find({ user_id: req.params.id });

        res.status(200).json({
            success: true,
            data: subscriptions,
        });
    } catch (error) {
        next(error);
    }
};

export { createSubscription, renewSubscription, getUserSubscriptions };