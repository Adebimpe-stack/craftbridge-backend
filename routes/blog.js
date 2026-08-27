const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Blog = require("../models/Blog");
const User = require("../models/User");
const { generateBlogSlug } = require("../utils/blogSlugGenerator");

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

// =========================
// PUBLIC: GET ALL PUBLISHED BLOGS
// GET /api/blog
// =========================
router.get("/", async (req, res) => {
  try {
    const { category, tag, search, page = 1, limit = 10 } = req.query;
    
    const query = { status: "published" };
    
    if (category) query.category = category;
    if (tag) query.tags = tag;
    if (search) {
      query.$text = { $search: search };
    }

    const skip = (page - 1) * limit;
    
    const blogs = await Blog.find(query)
      .populate("author", "name profilePicture")
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Blog.countDocuments(query);

    res.json({
      blogs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("GET BLOGS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// PUBLIC: GET SINGLE BLOG BY SLUG
// GET /api/blog/:slug
// =========================
router.get("/:slug", async (req, res) => {
  try {
    const blog = await Blog.findOne({ 
      slug: req.params.slug, 
      status: "published" 
    })
      .populate("author", "name profilePicture");

    if (!blog) {
      return res.status(404).json({ message: "Blog post not found" });
    }

    // Increment view count
    blog.viewCount += 1;
    await blog.save();

    res.json(blog);
  } catch (err) {
    console.error("GET BLOG ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// ADMIN: CREATE BLOG
// POST /api/blog
// =========================
router.post("/", auth, requireAdmin, async (req, res) => {
  try {
    const { title, excerpt, content, category, tags, featuredImage, inlineCallout, sidebarWidget, status, seoTitle, seoDescription } = req.body;

    if (!title || !excerpt || !content) {
      return res.status(400).json({ message: "Title, excerpt, and content are required" });
    }

    let slug = generateBlogSlug(title);
    let existing = await Blog.findOne({ slug });
    let counter = 2;
    while (existing) {
      slug = `${generateBlogSlug(title)}-${counter}`;
      existing = await Blog.findOne({ slug });
      counter++;
    }

    const publishStatus = status === "published" ? "published" : "draft";
    const blogData = {
      title,
      slug,
      excerpt,
      content,
      category: category || "technical",
      tags: tags || [],
      featuredImage: featuredImage || "",
      author: req.user._id,
      inlineCallout: inlineCallout || {},
      sidebarWidget: sidebarWidget || {},
      seoTitle,
      seoDescription,
      status: publishStatus,
    };

    if (publishStatus === "published") {
      blogData.publishedAt = new Date();
    }

    const blog = await Blog.create(blogData);

    res.status(201).json({ message: "Blog created successfully", blog });
  } catch (err) {
    console.error("CREATE BLOG ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// ADMIN: UPDATE BLOG
// PUT /api/blog/:id
// =========================
router.put("/:id", auth, requireAdmin, async (req, res) => {
  try {
    const { title, excerpt, content, category, tags, featuredImage, inlineCallout, sidebarWidget, status, seoTitle, seoDescription } = req.body;

    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ message: "Blog post not found" });
    }

    // Update slug if title changed
    if (title && title !== blog.title) {
      blog.slug = generateBlogSlug(title);
    }

    if (title) blog.title = title;
    if (excerpt) blog.excerpt = excerpt;
    if (content) blog.content = content;
    if (category) blog.category = category;
    if (tags) blog.tags = tags;
    if (featuredImage !== undefined) blog.featuredImage = featuredImage;
    if (inlineCallout) blog.inlineCallout = { ...blog.inlineCallout, ...inlineCallout };
    if (sidebarWidget) blog.sidebarWidget = { ...blog.sidebarWidget, ...sidebarWidget };
    if (status) {
      blog.status = status;
      if (status === "published" && !blog.publishedAt) {
        blog.publishedAt = new Date();
      }
    }
    if (seoTitle !== undefined) blog.seoTitle = seoTitle;
    if (seoDescription !== undefined) blog.seoDescription = seoDescription;

    await blog.save();

    res.json({ message: "Blog updated successfully", blog });
  } catch (err) {
    console.error("UPDATE BLOG ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// ADMIN: DELETE BLOG
// DELETE /api/blog/:id
// =========================
router.delete("/:id", auth, requireAdmin, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ message: "Blog post not found" });
    }

    await Blog.findByIdAndDelete(req.params.id);

    res.json({ message: "Blog deleted successfully" });
  } catch (err) {
    console.error("DELETE BLOG ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// ADMIN: GET ALL BLOGS (including drafts)
// GET /api/blog/admin/all
// =========================
router.get("/admin/all", auth, requireAdmin, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    
    const query = {};
    if (status) query.status = status;

    const skip = (page - 1) * limit;
    
    const blogs = await Blog.find(query)
      .populate("author", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Blog.countDocuments(query);

    res.json({
      blogs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("GET ADMIN BLOGS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;