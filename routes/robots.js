const express = require("express");
const router = express.Router();

router.get("/robots.txt", (req, res) => {
  const robotsTxt = `User-agent: *
Allow: /jobs/
Allow: /api/jobs/sitemap.xml
Allow: /api/jobs/*/seo-html
Disallow: /api/
Disallow: /login
Disallow: /register
Disallow: /dashboard
Disallow: /admin

Sitemap: https://api.craftbridgejobs.com/api/jobs/sitemap.xml
`;

  res.set("Content-Type", "text/plain");
  res.send(robotsTxt);
});

module.exports = router;
