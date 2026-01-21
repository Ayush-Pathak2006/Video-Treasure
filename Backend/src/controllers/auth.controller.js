import { ApiResponse } from "../utils/ApiResponse.js";

const oauthSuccess = async (req, res) => {
  const user = req.user;

  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();

  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax"
  };

  res
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .redirect(process.env.FRONTEND_URL);
};

export { oauthSuccess };
