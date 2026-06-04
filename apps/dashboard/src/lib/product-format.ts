/** Human label for a product category enum value (Title Case). */
export function categoryLabel(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}
