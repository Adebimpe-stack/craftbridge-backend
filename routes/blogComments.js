const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const BlogComment = require("../models/BlogComment");
const Blog = require("../models/Blog");

// Middleware to check if user is professional
const requireProfessional = (req, res, next) => {
  if (req.user.role !== "jobseeker" && req.user.role !== "admin") {
    return res.status(403).json({ message: "Only professionals can comment" });
  }
  next();
};

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

// =========================
// PUBLIC: GET COMMENTS FOR BLOG
// GET /api/blog-comments/:blogId
// =========================
router.get("/:blogId", async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const skip = (page - 1) * limit;
    
    const comments = await BlogComment.find({ 
      blog: req.params.blogId, 
      status: "approved",
      parentComment: null 
    })
      .populate("author", "name profilePicture primaryTrade")
      .populate({
        path: "replies",
        match: { status: "approved" },
        populate: { path: "author", select: "name profilePicture primaryTrade" }
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await BlogComment.countDocuments({ 
      blog: req.params.blogId, 
      status: "approved",
      parentComment: null 
    });

    res.json({
      comments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("GET COMMENTS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// PROFESSIONAL: CREATE COMMENT
// POST /api/blog-comments
// =========================
router.post("/", auth, requireProfessional, async (req, res) => {
  try {
    const { blogId, content, parentCommentId } = req.body;

    if (!blogId || !content) {
      return res.status(400).json({ message: "Blog ID and content are required" });
    }

    // Verify blog exists and is published
    const blog = await Blog.findOne({ _id: blogId, status: "published" });
    if (!blog) {
      return res.status(404).json({ message: "Blog post not found" });
    }

    // If replying, verify parent comment exists
    if (parentCommentId) {
      const parentComment = await BlogComment.findById(parentCommentId);
      if (!parentComment) {
        return res.status(404).json({ message: "Parent comment not found" });
      }
    }

    const comment = await BlogComment.create({
      blog: blogId,
      author: req.user._id,
      content,
      parentComment: parentCommentId || null,
      status: "pending", // Comments require moderation
    });

    // Update blog comment count
    await Blog.findByIdAndUpdate(blogId, { $inc: { commentCount: 1 } });

    res.status(201).json({ message: "Comment submitted for moderation", comment });
  } catch (err) {
    console.error("CREATE COMMENT ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// PROFESSIONAL: LIKE/UNLIKE COMMENT
// POST /api/blog-comments/:commentId/like
// =========================
router.post("/:commentId/like", auth, requireProfessional, async (req, res) => {
  try {
    const comment = await BlogComment.findById(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const userId = req.user._id;
    const hasLiked = comment.likes.includes(userId);

    if (hasLiked) {
      // Unlike
      comment.likes = comment.likes.filter(id => id.toString() !== userId.toString());
      comment.likeCount = Math.max(0, comment.likeCount - 1);
    } else {
      // Like
      comment.likes.push(userId);
      comment.likeCount += 1;
    }

    await comment.save();

    res.json({ 
      message: hasLiked ? "Comment unliked" : "Comment liked",
      likeCount: comment.likeCount,
      hasLiked: !hasLiked
    });
  } catch (err) {
    console.error("LIKE COMMENT ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// ADMIN: GET ALL COMMENTS (for moderation)
// GET /api/blog-comments/admin/all
// =========================
router.get("/admin/all", auth, requireAdmin, async (req, res) => {
  try {
    const { status, blogId, page = 1, limit = 50 } = req.query;
    
    const query = {};
    if (status) query.status = status;
    if (blogId) query.blog = blogId;

    const skip = (page - 1) * limit;
    
    const comments = await BlogComment.find(query)
      .populate("author", "name email")
      .populate("blog", "title")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await BlogComment.countDocuments(query);

    res.json({
      comments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("GET ADMIN COMMENTS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// ADMIN: MODERATE COMMENT
// PUT /api/blog-comments/:commentId/status
// =========================
router.put("/:commentId/status", auth, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;

    if (!["pending", "approved", "rejected", "spam"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const comment = await BlogComment.findById(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const previousStatus = comment.status;
    comment.status = status;

    // Update blog comment count if status changes to/from approved
    if (previousStatus !== "approved" && status === "approved") {
      await Blog.findByIdAndUpdate(comment.blog, { $inc: { commentCount: 1 } });
    } else if (previousStatus === "approved" && status !== "approved") {
      await Blog.findByIdAndUpdate(comment.blog, { $inc: { commentCount: -1 } });
    }

    await comment.save();

    res.json({ message: `Comment ${status} successfully`, comment });
  } catch (err) {
    console.error("MODERATE COMMENT ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// ADMIN: DELETE COMMENT
// DELETE /api/blog-comments/:commentId
// =========================
router.delete("/:commentId", auth, requireAdmin, async (req, res) => {
  try {
    const comment = await BlogComment.findById(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    // Update blog comment count if comment was approved
    if (comment.status === "approved") {
      await Blog.findByIdAndUpdate(comment.blog, { $inc: { commentCount: -1 } });
    }

    // Delete all replies
    await BlogComment.deleteMany({ parentComment: req.params.commentId });

    // Delete comment
    await BlogComment.findByIdAndDelete(req.params.commentId);

    res.json({ message: "Comment deleted successfully" });
  } catch (err) {
    console.error("DELETE COMMENT ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;