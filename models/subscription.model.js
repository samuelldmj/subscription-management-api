import mongoose from "mongoose";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const subscriptionSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Subscription name is required"],
            trim: true,
            minlength: [2, "Name must be at least 2 characters"],
            maxlength: [100, "Name cannot exceed 100 characters"],
        },
        price: {
            type: Number,
            required: [true, "Subscription price is required"],
            min: [0, "Price must be greater than or equal to 0"],
        },
        currency: {
            type: String,
            enum: ["USD", "EUR", "GBP"],
            default: "USD",
        },
        frequency: {
            type: String,
            enum: ["daily", "weekly", "monthly", "yearly"],
            required: [true, "Frequency is required"],
        },
        category: {
            type: String,
            enum: ["sports", "news", "entertainment", "lifestyle", "technology", "finance", "politics", "other"],
            required: [true, "Category is required"],
            trim: true,
        },
        status: {
            type: String,
            enum: ["active", "cancelled", "expired"],
            default: "active",
        },
        startDate: {
            type: Date,
            required: [true, "Start date is required"],
            validate: {
                validator: async function (value) {
                    const user = await mongoose.model("User").findById(this.user_id);
                    const customerTimezone = user?.timezone || "UTC";
                    const inputDate = dayjs.tz(value, customerTimezone).startOf("day");
                    const today = dayjs().tz(customerTimezone).startOf("day");
                    return inputDate.isValid() && !inputDate.isBefore(today, "day");
                },
                message: "Start date must be today or in the future in YYYY-MM-DD or ISO format",
            },
        },
        renewalDate: {
            type: Date,
            required: [true, "Renewal date is required"],
            validate: {
                validator: async function (value) {
                    const user = await mongoose.model("User").findById(this.user_id);
                    const customerTimezone = user?.timezone || "UTC";
                    const renewalDateTz = dayjs.tz(value, customerTimezone);
                    const startDateTz = dayjs.tz(this.startDate, customerTimezone);
                    const nowTz = dayjs().tz(customerTimezone);
                    return renewalDateTz.isAfter(startDateTz) && renewalDateTz.isAfter(nowTz);
                },
                message: "Renewal date must be after the start date and in the future",
            },
        },
        user_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "User ID is required"],
            index: true,
        },
        paymentMethod: {
            type: String,
            enum: ["Credit Card", "PayPal", "Bank Transfer", "Other"],
            required: [true, "Payment method is required"],
            trim: true,
        },
        autoRenew: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
        indexes: [{ key: { renewalDate: 1 } }],
    }
);

subscriptionSchema.pre("save", function (next) {
    next();
});

const Subscription = mongoose.model("Subscription", subscriptionSchema);

export default Subscription;