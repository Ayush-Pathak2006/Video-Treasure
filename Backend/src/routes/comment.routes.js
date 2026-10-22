import { Router } from 'express';
import {
    getComments,
    getReplies,
    postComment,
    editComment,
    deleteComment,
    likeComment,
    unlikeComment,
} from '../controllers/comment.controller.js';
import { optionalJWT, verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();

// Everyone can read comments. Logged-in readers also learn which ones they liked and wrote; writing needs a login.
router.route("/").get(optionalJWT, getComments).post(verifyJWT, postComment);
router.route("/:commentId").patch(verifyJWT, editComment).delete(verifyJWT, deleteComment);
router.route("/:commentId/replies").get(optionalJWT, getReplies);
router.route("/:commentId/like").put(verifyJWT, likeComment).delete(verifyJWT, unlikeComment);

export default router;
