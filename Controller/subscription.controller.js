import Subscription from "../models/subscription.model.js"


const createSubscription = async (req, res, next) => {
    try {

        const subscription = await Subscription.create({
            ...req.body,
            user_id: req.user._id,
            startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        })

        res.status(201).json({
            success: true,
            data: subscription
        })

    } catch (err) {
        next(err);
    }
}


const getUserSubscriptions = async (req, res, next) => {
    try {
        if (req.user._id.toString() !== req.params.id) {
            const error = new Error('You are not the owner of this account!!');
            error.status = 401;
            throw error;
        }

        const subscriptions = await Subscription.find({ user_id: req.params.id });

        res.status(200).json({
            success: true,
            data: subscriptions
        })

    } catch (error) {
        next(error)
    }
}


export {
    createSubscription,
    getUserSubscriptions
};

