const express = require("express");
const router = express.Router();

router.get("/robots.txt", (req, res) => {
  const robotsTxt = `User-agent: *
Allow: /jobs/
Allow: /professionals/
Allow: /api/jobs/sitemap.xml
Allow: /api/jobs/*/seo-html
Allow: /api/professionals/sitemap.xml
Disallow: /api/
Disallow: /login
Disallow: /register
Disallow: /dashboard
Disallow: /admin

Sitemap: https://api.craftbridgejobs.com/api/jobs/sitemap.xml
Sitemap: https://api.craftbridgejobs.com/api/professionals/sitemap.xml
`;

  res.set("Content-Type", "text/plain");
  res.send(robotsTxt);
});

module.exports = router;
