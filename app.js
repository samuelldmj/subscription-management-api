import express from "express";
import { PORT } from "./config/env.js";
import authRouter from "./routes/auth.routes.js";
import userRouter from "./routes/user.routes.js";
import subscriptionRouter from "./routes/subscription.routes.js";
import connectToDatabase from "./database/mongodb.js";
import errorMiddleware from "./middlewares/error.middleware.js";
import cookieParser from "cookie-parser";
import morgan from "morgan";


// Import the User and Subscription models
import User from "./models/user.model.js";
import Subscription from "./models/subscription.model.js";
import arcjetMiddleware from "./middlewares/arcjet.middleware.js";
import workFlowRouter from "./routes/workflow.routes.js";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(morgan('dev'));
app.use(arcjetMiddleware);

// Basic route for testing
app.get('/', (req, res) => {
    res.send('Welcome to the Subscription Tracker API');
});

// Mount routers
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/subscriptions', subscriptionRouter);
app.use('/api/v1/workflows', workFlowRouter);

//global errorHandling
app.use(errorMiddleware);

// Start server and connect to database
const startServer = async () => {
    await connectToDatabase();
    app.listen(PORT, () => {
        console.log(`Subscription Tracker API is running on http://localhost:${PORT}`);
    });
};

startServer();

export default app;