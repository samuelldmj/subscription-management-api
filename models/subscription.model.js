import mongoose from "mongoose";
import dayjs from "dayjs";

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
                validator: function (value) {
                    const today = dayjs().startOf("day");
                    const inputDate = dayjs(value, ["YYYY-MM-DD", "YYYY-MM-DDTHH:mm:ss.SSSZ"], true).startOf("day");
                    if (!inputDate.isValid()) {
                        return false;
                    }
                    return inputDate.isSame(today, "day");
                },
                message: "Start date must be the current date in YYYY-MM-DD or ISO format",
            },
        },
        renewalDate: {
            type: Date,
            required: [true, "Renewal date is required"],
            validate: {
                validator: function (value) {
                    return value > this.startDate && dayjs(value).isAfter(dayjs());
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
            enum: ["Credit Card", "PayPal", "Bank Transfer", "Cash", "Other"],
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