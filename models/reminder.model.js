// models/reminder.model.js
import mongoose from "mongoose";

const reminderSchema = new mongoose.Schema({
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: "Subscription", required: true },
    reminderLabel: { type: String, required: true },
    userEmail: { type: String, required: true },
    userName: { type: String, required: true },
    reminderType: { type: String, enum: ["pre-renewal", "grace-period"], required: true },
    scheduledAt: { type: Date, required: true },
    status: { type: String, enum: ["pending", "sent", "failed"], default: "pending" },
    timezone: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Reminder", reminderSchema);