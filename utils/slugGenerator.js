/**
 * Slug Generator Utility
 * Creates SEO-friendly URLs from job titles and locations
 */

function generateSlug(title, location, id) {
  const suffix = id ? String(id).slice(-6) : Date.now().toString(36);

  if (!title) return `job-${suffix}`;
  
  // Convert to lowercase and replace spaces with hyphens
  let slug = title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  
  // Add location if available
  if (location) {
    const locationSlug = location
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    
    if (locationSlug) {
      slug = `${slug}-${locationSlug}`;
    }
  }
  
  // Add unique identifier to ensure uniqueness
  slug = `${slug}-${suffix}`;
  
  return slug;
}

function ensureUniqueSlug(baseSlug, existingSlugs) {
  let slug = baseSlug;
  let counter = 1;
  
  while (existingSlugs.has(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
  
  return slug;
}

module.exports = {
  generateSlug,
  ensureUniqueSlug
};