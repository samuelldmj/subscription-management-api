import mongoose from "mongoose"
import User from "../models/user.model.js";
import bcrypt from 'bcrypt';
import jwt from "jsonwebtoken";
import { JWT_EXPIRES_IN, JWT_SECRET } from "../config/env.js";

const signUp = async (req, res, next) => {

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { name, email, password } = req.body;

        //check if a user already exist
        const getUserbyEmail = await User.findOne({ email });

        if (getUserbyEmail) {
            const error = new Error('User already exists');
            error.statusCode = 409;
            throw error;
        }

        //hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUsers = await User.create([{ name, email, password: hashedPassword }], { session });

        const token = jwt.sign({ userId: newUsers[0]._id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        await session.commitTransaction();
        session.endSession();

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: {
                token,
                user: newUsers[0],
            }
        })

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        next(error);
    }

}


const signIn = async (req, res, next) => {

    try {
        const { email, password } = req.body;

        const getUserByEmail = await User.findOne({ email });

        if (!getUserByEmail) {
            const error = new Error('User not found');
            error.statusCode = 404
            throw error;
        }

        const isPasswordValid = await bcrypt.compare(password, getUserByEmail.password);

        if (!isPasswordValid) {
            const error = new Error('Invalid password');
            error.statusCode = 401;
            throw error;
        }

        const token = jwt.sign({ userId: getUserByEmail._id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        res.status(200).json({
            success: true,
            message: "user signed in successfully",
            data: {
                token,
                getUserByEmail,
            }
        })


    } catch (error) {
        next(error)
    }

}

const signOut = async (req, res, next) => {

}



export { signUp, signIn, signOut }