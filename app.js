import express from "express";
import { PORT } from "./config/env.js";
import authRouter from "./routes/auth.routes.js";
import userRouter from "./routes/user.routes.js";
import subscriptionRouter from "./routes/subscription.routes.js";
import connectToDatabase from "./database/mongodb.js";

// Import the User and Subscription models
// import User from "./models/user.model.js";
// import Subscription from "./models/subscription.model.js";

const app = express();

// Basic route for testing
app.get('/', (req, res) => {
    res.send('Welcome to the Subscription Tracker API');
});

// Mount routers
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/subscriptions', subscriptionRouter);

// Start server and connect to database
const startServer = async () => {
    await connectToDatabase();
    app.listen(PORT, () => {
        console.log(`Subscription Tracker API is running on http://localhost:${PORT}`);
    });
};

startServer();

export default app;