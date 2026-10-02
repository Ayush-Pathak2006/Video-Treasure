import { ApiResponse } from "../utils/ApiResponse.js";
import { AUTH_COOKIE_OPTIONS } from "../constants.js";

const oauthSuccess = async (req, res) => {
  const user = req.user;//Here we just make user === user form the db which follows our model and have properties of userSchema. We do this auth.middleware.js file.

  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();

  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  res
    .cookie("accessToken", accessToken, AUTH_COOKIE_OPTIONS)
    .cookie("refreshToken", refreshToken, AUTH_COOKIE_OPTIONS)
    .redirect(process.env.FRONTEND_URL);
};

export { oauthSuccess };
