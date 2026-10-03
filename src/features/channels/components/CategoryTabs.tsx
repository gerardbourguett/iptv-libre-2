import { memo } from "react";

type CategoryTabsProps = {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
};

// A horizontally-scrollable pill bar — the recognizable "familiar streaming
// app" genre-browsing pattern. Chosen over a fixed-width sidebar because it
// scrolls instead of needing to hide/overlap at narrow window widths: there
// is no breakpoint where this component can visually collide with anything
// next to it, since it never claims more than its own row.
function CategoryTabsComponent({
  categories,
  selectedCategory,
  onSelectCategory,
}: CategoryTabsProps) {
  return (
    <nav aria-label="Categories" className="category-tabs-wrap">
      <ul className="category-tabs">
        {categories.map((category) => {
          const active = selectedCategory === category;
          return (
            <li key={category}>
              <button
                type="button"
                className={["category-pill", active ? "category-pill--active" : ""].join(" ")}
                aria-pressed={active}
                onClick={() => onSelectCategory(category)}
              >
                {category}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export const CategoryTabs = memo(CategoryTabsComponent);
