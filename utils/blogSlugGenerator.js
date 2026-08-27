const generateBlogSlug = (title) => {
  if (!title) return '';
  
  // Convert to lowercase and replace spaces with hyphens
  let slug = title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  
  // Limit length and add random suffix for uniqueness
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const baseSlug = slug.substring(0, 50);
  return `${baseSlug}-${randomSuffix}`;
};

module.exports = { generateBlogSlug };