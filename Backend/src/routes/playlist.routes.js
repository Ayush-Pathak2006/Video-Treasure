import { Router } from 'express';
import {
    createPlaylist,
    getMyPlaylists,
    getPlaylistsContainingVideo,
    getPlaylistById,
    updatePlaylist,
    deletePlaylist,
    addVideoToPlaylist,
    removeVideoFromPlaylist,
} from '../controllers/playlist.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();

// Playlists are private: every route needs a logged-in user.
router.use(verifyJWT);

router.route("/").get(getMyPlaylists).post(createPlaylist);
// Before "/:playlistId", which would otherwise take "containing" as an id.
router.route("/containing/:videoKey").get(getPlaylistsContainingVideo);
router.route("/:playlistId").get(getPlaylistById).patch(updatePlaylist).delete(deletePlaylist);
router.route("/:playlistId/videos").post(addVideoToPlaylist);
router.route("/:playlistId/videos/:videoKey").delete(removeVideoFromPlaylist);

export default router;
