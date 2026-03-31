export const NICHE_TOPICS = [
  {
    name: "Programming & Development",
    keywords: ["React", "Python", "DSA", "Web Dev"],
  },
  {
    name: "AI & Machine Learning",
    keywords: ["ChatGPT", "LLMs", "Data Science"],
  },
  {
    name: "Finance & Stock Market",
    keywords: ["Investing", "Trading", "Crypto"],
  },
  {
    name: "Fitness & Bodybuilding",
    keywords: ["Gym", "Diet", "Home workout"],
  },
  {
    name: "Gaming",
    keywords: ["Esports", "Gameplay", "Walkthrough"],
  },
  {
    name: "Study & Productivity",
    keywords: ["Study tips", "Time management"],
  },
  {
    name: "Design & UI/UX",
    keywords: ["Figma", "UI design", "UX case study"],
  },
  {
    name: "Cooking & Recipes",
    keywords: ["Quick meals", "Indian recipes"],
  },
  {
    name: "Tech News & Gadgets",
    keywords: ["Smartphones", "AI tools"],
  },
  {
    name: "Mental Health & Self Improvement",
    keywords: ["Motivation", "discipline", "habits"],
  },
];

export const getCombinedNicheQuery = niche => niche.keywords.join(" ");