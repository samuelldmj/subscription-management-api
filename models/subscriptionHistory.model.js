// models/subscriptionHistory.model.js
import mongoose from "mongoose";

const subscriptionHistorySchema = new mongoose.Schema(
    {
        subscriptionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Subscription",
            required: true,
        },
        action: {
            type: String,
            enum: ["created", "renewed", "expired", "cancelled", "remindersScheduled", "reminderSent"],
            required: true,
        },
        details: {
            type: Object,
            default: {},
        },
        timestamp: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

const SubscriptionHistory = mongoose.model("SubscriptionHistory", subscriptionHistorySchema);

export default SubscriptionHistory;