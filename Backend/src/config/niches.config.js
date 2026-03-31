export const NICHE_TOPICS = [
  {
    name: "Programming & Development",
    keywords: ["React", "Python", "DSA", "Web Dev"],
    aliases: ["programming", "development", "coding"],
  },
  {
    name: "AI & Machine Learning",
    keywords: ["ChatGPT", "LLMs", "Data Science"],
    aliases: ["ai", "machine learning", "ml"],
  },
  {
    name: "Finance & Stock Market",
    keywords: ["Investing", "Trading", "Crypto"],
    aliases: ["finance", "stock market", "stocks", "investing"],
  },
  {
    name: "Fitness & Bodybuilding",
    keywords: ["Gym", "Diet", "Home workout"],
    aliases: ["fitness", "bodybuilding", "workout"],
  },
  {
    name: "Gaming",
    keywords: ["Esports", "Gameplay", "Walkthrough"],
    aliases: ["gaming", "esports"],
  },
  {
    name: "Study & Productivity",
    keywords: ["Study tips", "Time management"],
    aliases: ["study", "productivity", "focus"],
  },
  {
    name: "Design & UI/UX",
    keywords: ["Figma", "UI design", "UX case study"],
    aliases: ["design", "ui", "ux"],
  },
  {
    name: "Cooking & Recipes",
    keywords: ["Quick meals", "Indian recipes"],
    aliases: ["cooking", "recipes", "food"],
  },
  {
    name: "Tech News & Gadgets",
    keywords: ["Smartphones", "AI tools"],
    aliases: ["tech", "gadgets", "tech news"],
  },
  {
    name: "Mental Health & Self Improvement",
    keywords: ["Motivation", "discipline", "habits"],
    aliases: ["mental health", "self improvement", "motivation"],
  },
  {
    name: "Sports",
    keywords: ["Football highlights", "NBA", "Cricket", "Sports analysis"],
    aliases: ["sports", "athletics", "game highlights"],
  },
  {
    name: "Music",
    keywords: ["Pop songs", "Live performance", "Lo-fi", "Music video"],
    aliases: ["music", "songs", "playlist"],
  },
];

export const getCombinedNicheQuery = niche => niche.keywords.join(" ");