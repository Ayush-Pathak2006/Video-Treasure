import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import { generateAccessAndRefreshTokens } from "../models/user.model.js";
import crypto from "crypto";
import { sendVerificationEmail } from "../utils/sendVerificationEmail.js";


//verification email function (temporary)
// const sendVerificationEmail = async (email, verificationUrl) => {
//     // TEMP: Replace later with Brevo
//     console.log("📧 Verification email sent to:", email);
//     console.log("🔗 Verification link:", verificationUrl);
// }  we are importing this fiunction



const registerUser = asyncHandler(async (req, res) => {
    const { fullName, email, username, password } = req.body;

    // 1️⃣ Validate input
    if ([fullName, email, username, password].some((field) => field?.trim() === "")) {
        throw new ApiError(400, "All fields are required");
    }

    // 2️⃣ Check if user already exists
    const existedUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existedUser) {
        throw new ApiError(409, "User with email or username already exists");
    }

    // 3️⃣ Create user (NOT verified yet)
    const user = await User.create({
        fullName,
        email,
        username: username.toLowerCase(),
        password,
        authProvider: "local",
        isEmailVerified: false
    });

    // 4️⃣ Generate email verification token (RAW)
    const verificationToken = crypto.randomBytes(32).toString("hex");

    // 5️⃣ Hash the token before saving
    const hashedToken = crypto
        .createHash("sha256")
        .update(verificationToken)
        .digest("hex");

    // 6️⃣ Save hashed token + expiry
    user.emailVerificationToken = hashedToken;
    user.emailVerificationExpiry = Date.now() + 15 * 60 * 1000; // 15 minutes

    await user.save({ validateBeforeSave: false });

    // 7️⃣ Build verification URL (frontend route)
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

    // 8️⃣ Send verification email (placeholder)
    await sendVerificationEmail(user.email, verificationUrl);

    // 9️⃣ Respond (NO login here)
    return res.status(201).json(
        new ApiResponse(
            201,
            {},
            "User registered successfully. Please verify your email to activate your account."
        )
    );
});


const loginUser = asyncHandler(async (req, res) => {

    const { email, username, password } = req.body;

    if (!username && !email) {
        throw new ApiError(400, "Username or email is required");
    }

    const user = await User.findOne({
        $or: [{ username }, { email }]
    });

    if (!user) {
        throw new ApiError(404, "User does not exist");
    }

    const isPasswordValid = await user.isPasswordCorrect(password);
    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid user credentials");
    }

    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });


    //refresh token is being shown in console for debugging


    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: "lax"
    };

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    user: await User.findById(user._id).select("-password -refreshToken"),
                    accessToken,
                    refreshToken
                },
                "User logged In Successfully"
            )
        );
});


const logoutUser = asyncHandler(async (req, res) => {
    
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined
            }
        },
        {
            new: true
        }
    );

    const options = {
        httpOnly: true,
        secure: true
    };

    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, {}, "User logged out"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {

    console.log("--- REFRESH TOKEN ATTEMPT ---");
    console.log("Cookies received by backend:", req.cookies);


    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (!incomingRefreshToken) {
        throw new ApiError(401, "Unauthorized request");
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        );



        const user = await User.findById(decodedToken?._id);

        if (!user) {
            throw new ApiError(401, "Invalid refresh token");
        }

        if (incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, "Refresh token is expired or used");
        }

        const { accessToken, refreshToken: newRefreshToken } = await generateAccessAndRefreshTokens(user._id);

        const options = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: "lax"
        };

        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", newRefreshToken, options)
            .json(
                new ApiResponse(
                    200,
                    {
                        user: await User.findById(user._id).select("-password -refreshToken"),
                        accessToken, refreshToken: newRefreshToken
                    },
                    "Access token refreshed"
                )
            );
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token");
    }
});

//verification of email controller
const verifyEmail = asyncHandler(async (req, res) => {
    const { token } = req.query;

    // 1️⃣ Token must exist
    if (!token) {
        throw new ApiError(400, "Verification token is missing");
    }

    // 2️⃣ Hash incoming token (same way we hashed before saving)
    const hashedToken = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

    // 3️⃣ Find user with valid token & unexpired
    const user = await User.findOne({
        emailVerificationToken: hashedToken,
        emailVerificationExpiry: { $gt: Date.now() }
    });

    if (!user) {
        throw new ApiError(400, "Invalid or expired verification token");
    }

    // 4️⃣ Mark email as verified
    user.isEmailVerified = true;

    // 5️⃣ Cleanup verification fields
    user.emailVerificationToken = undefined;
    user.emailVerificationExpiry = undefined;

    await user.save({ validateBeforeSave: false });

    // 6️⃣ Respond (NO auto-login)
    return res.status(200).json(
        new ApiResponse(
            200,
            {},
            "Email verified successfully. You can now log in."
        )
    );
});



export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    verifyEmail
};
