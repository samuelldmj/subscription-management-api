import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema({

    name: {
        type: String,
        // Sets the field type as String for the subscription name.
        required: [true, 'Subscription name is required'],
        // Makes the name field mandatory with a custom error message if missing.
        trim: true,
        // Removes leading/trailing whitespace from the name.
        minlength: 2,
        // Ensures the name is at least 2 characters long.
        maxlength: 100,
        // Limits the name to a maximum of 100 characters.
    },

    price: {
        type: Number,
        // Sets the field type as Number for the subscription price.
        required: [true, 'Subscription price is required'],
        // Makes the price field mandatory with a custom error message.
        min: [0, 'Price must be greater than 0']
        // Ensures the price is not negative, with a custom error message.
    },

    currency: {
        type: String,
        // Sets the field type as String for the currency.
        enum: ['USD', 'EUR', 'GBP'],
        // Restricts currency to specific values: USD, EUR, or GBP.
        default: 'USD'
        // Sets the default currency to USD if not specified.
    },

    frequency: {
        type: String,
        // Sets the field type as String for billing frequency.
        enum: ['daily', 'weekly', 'monthly', 'yearly']
        // Restricts frequency to specific values: daily, weekly, monthly, or yearly.
    },

    category: {
        type: String,
        // Sets the field type as String for the subscription category.
        enum: ['sports', 'news', 'entertainment', 'lifestyle', 'technology', 'finance', 'politics', 'other'],
        // Restricts category to a predefined list of options.
        required: true,
        // Makes the category field mandatory.
        trim: true
        // Removes leading/trailing whitespace from the category.
    },

    status: {
        type: String,
        // Sets the field type as String for the subscription status.
        enum: ['active', 'cancelled', 'expired'],
        // Restricts status to specific values: active, cancelled, or expired.
        default: 'active'
        // Sets the default status to 'active' if not specified.
    },

    startDate: {
        type: Date,
        // Sets the field type as Date for the subscription start date.
        validate: {
            validator: (value) => value <= new Date(),
            // Ensures the start date is not in the future.
            message: 'Start date must be in the past'
            // Custom error message for invalid start dates.
        }
    },

    renewalDate: {
        type: Date,
        // Sets the field type as Date for the subscription renewal date.
        validate: {
            validator: function (value) {
                return value > this.startDate;
                // Ensures the renewal date is after the start date.
            },
            message: 'Renewal date must be after the date'
            // Custom error message (note: 'date' should likely say 'start date').
        }
    },

    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        // Sets the field type as ObjectId, a MongoDB-specific ID type.
        'ref': 'User',
        // References the 'User' model for this field (foreign key relationship).
        required: true,
        // Makes the user_id field mandatory.
        index: true
        // Creates an index on user_id for faster queries.
    },

    paymentMethod: {
        type: String,
        enum: ['Credit Card', 'PayPal', 'Bank Transfer', 'Other'],
        trim: true,
    }
}, { timestamps: true })
// Adds createdAt and updatedAt fields automatically to track document creation/update times.

subscriptionSchema.pre('save', function (next) {
    // Defines a pre-save middleware hook that runs before saving a document.
    if (!this.renewalDate && this.startDate && this.frequency) {
        // Checks if renewalDate is not set.
        const renewalPeriod = {
            daily: 1,
            weekly: 7,
            monthly: 30,
            yearly: 365,
        }
        // Defines an object mapping frequency to days for renewal calculation.

        this.renewalDate = new Date(this.startDate);
        // Sets renewalDate to a new Date object based on startDate.
        this.renewalDate.setDate(this.renewalDate.getDate() + renewalPeriod[this.frequency]);
        // Calculates renewal date by adding the appropriate days based on frequency.
    }

    if (this.renewalDate < new Date()) {
        // Checks if the renewal date has passed (is before today).
        this.status = 'expired';
        // Updates the status to 'expired' if the renewal date is in the past.
    }
    next();
    // Calls the next middleware function or saves the document if no more middleware.
})

const Subscription = mongoose.model('Subscription', subscriptionSchema);
// Creates a Mongoose model named 'subscription' based on the schema.

export default Subscription;
// Exports the Subscription model for use in other parts of the application.