import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/env.js";
import User from "../models/user.model.js";

const authorize = async (req, res, next) => {
    try {
        let token;

        if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
            token = req.headers.authorization.split(" ")[1];
        }

        if (!token) {
            const error = new Error("No token provided");
            error.status = 401;
            throw error;
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId);

        if (!user) {
            const error = new Error("User not found");
            error.status = 401;
            throw error;
        }

        req.user = user;
        next();
    } catch (error) {
        error.status = error.status || 401;
        error.message = error.message || "Unauthorized";
        next(error);
    }
};

export { authorize };