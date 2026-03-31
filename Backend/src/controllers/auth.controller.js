import { ApiResponse } from "../utils/ApiResponse.js";

const oauthSuccess = async (req, res) => {
  const user = req.user;//Here we just make user === user form the db which follows our model and have properties of userSchema. We do this auth.middleware.js file.

  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();

  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  const options = {
    httpOnly: true,
    secure: true,
    sameSite: "none"
  };

  res
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .redirect(process.env.FRONTEND_URL);
};

export { oauthSuccess };
