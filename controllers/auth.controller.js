import mongoose from "mongoose";
import User from "../models/user.model.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { JWT_EXPIRES_IN, JWT_SECRET } from "../config/env.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

// Extend dayjs with both utc and timezone plugins
dayjs.extend(utc);
dayjs.extend(timezone);

const signUp = async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { name, email, password, timezone } = req.body;

        // Validate timezone if provided
        const now = dayjs();
        if (timezone) {
            try {
                dayjs.tz(now, timezone);
            } catch (error) {
                const err = new Error("Invalid timezone");
                err.statusCode = 400;
                next(error);
                throw err;
            }
        }

        // Check if user already exists
        const getUserByEmail = await User.findOne({ email }).session(session);
        if (getUserByEmail) {
            const error = new Error("User already exists");
            error.statusCode = 409;
            throw error;
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user with timezone (defaults to "UTC" in model if not provided)
        const newUsers = await User.create(
            [{ name, email, password: hashedPassword, timezone: timezone || "UTC" }],
            { session }
        );

        const token = jwt.sign({ userId: newUsers[0]._id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        await session.commitTransaction();
        session.endSession();

        res.status(201).json({
            success: true,
            message: "User created successfully",
            data: {
                token,
                user: {
                    _id: newUsers[0]._id,
                    name: newUsers[0].name,
                    email: newUsers[0].email,
                    timezone: newUsers[0].timezone,
                },
            },
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        next(error);
    }
};


const signIn = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        const getUserByEmail = await User.findOne({ email });
        if (!getUserByEmail) {
            const error = new Error("User not found");
            error.statusCode = 404;
            throw error;
        }

        const isPasswordValid = await bcrypt.compare(password, getUserByEmail.password);
        if (!isPasswordValid) {
            const error = new Error("Invalid password");
            error.statusCode = 401;
            throw error;
        }

        const token = jwt.sign({ userId: getUserByEmail._id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        res.status(200).json({
            success: true,
            message: "User signed in successfully",
            data: {
                token,
                user: {
                    _id: getUserByEmail._id,
                    name: getUserByEmail.name,
                    email: getUserByEmail.email,
                    timezone: getUserByEmail.timezone,
                },
            },
        });
    } catch (error) {
        next(error);
    }
};

const signOut = async (req, res, next) => {
    try {
        res.status(200).json({
            success: true,
            message: "User signed out successfully",
        });
    } catch (error) {
        next(error);
    }
};

export { signUp, signIn, signOut };