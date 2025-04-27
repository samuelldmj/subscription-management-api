

const errorMiddleware = (err, req, res, next) => {

    try {

        if (res.headersSent) {
            return next(err); // Skip if headers already sent
        }


        let error = { ...err }
        error.message = err.message;

        console.error(err)

        // Logging error details (including stack trace in development mode)
        console.error("Error:", {
            message: err.message,
            stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
        });


        //Mongoose bad ObjectId
        if (err.name === 'CastError') {
            const message = 'Resources not found';
            error = new Error(message);
            error.statusCode = 404;
        }

        //Mongoose duplicate key
        if (err.code === 11000) {
            const message = 'Duplicate field value entered';
            error = new Error(message);
            error.statusCode = 400;
        }

        //Mongoose validation error
        if (err.name === 'ValidationError') {
            const message = Object.values(err.errors).map(val => val.message);
            error = new Error(message.join(', '));
            error.statusCode = 400;
        }

        res.status(error.statusCode || 500).json({ success: false, error: error.message || 'Server Error' })

    } catch (error) {
        //next(error) is only called in the rare case of an error within the middleware(above) itself.
        next(error)
    }

}


export default errorMiddleware