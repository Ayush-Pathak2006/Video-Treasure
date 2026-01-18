
//Creating this middleware to handle errors globally it is causing issue in my resending the error message from backend to frontend in login and register page

import { ApiError } from "../utils/ApiError.js";

const errorHandler = (err, req, res, next) => {
    // If it's our custom ApiError
    if (err instanceof ApiError) {
        return res.status(err.statusCode).json({
            success: false,
            message: err.message
        });
    }

    // Fallback for unknown errors
    console.error("🔥 UNHANDLED ERROR:", err);

    return res.status(500).json({
        success: false,
        message: "Internal Server Error"
    });
};

export { errorHandler };
