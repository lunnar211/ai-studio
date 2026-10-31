// Moderation blocklist for logo prompts: trademarked brands, characters and
// celebrity names. Case-insensitive substring match. This is a launch
// guard, not a legal opinion; borderline prompts are refused with a clear
// message so the user can rephrase with an original concept.
export const BLOCKED_TERMS: string[] = [
  "nike", "adidas", "apple", "google", "microsoft", "amazon", "coca-cola",
  "coca cola", "pepsi", "mcdonald", "starbucks", "disney", "marvel",
  "netflix", "spotify", "tesla", "samsung", "sony", "nintendo", "pokemon",
  "batman", "superman", "spiderman", "spider-man", "harry potter",
  "star wars", "facebook", "instagram", "twitter", "youtube", "tiktok",
  "lego", "ferrari", "gucci", "louis vuitton", "chanel", "rolex", "fifa",
  "olympics", "barbie", "hello kitty", "mickey mouse", "donald duck",
  "red bull", "visa", "mastercard", "paypal", "uber", "airbnb", "windows",
  "iphone", "android", "playstation", "xbox", "avengers", "jurassic",
  "taylor swift", "beyonce", "elon musk", "messi", "ronaldo", "kanye",
  "kim kardashian", "justin bieber", "ariana grande", "drake", "eminem",
  "bat-man", "wonder woman", "iron man", "hulk", "thor", "joker",
  "fanta", "sprite", "nestle", "kfc", "burger king", "dominos",
  "chatgpt", "openai", "claude", "meta", "whatsapp", "linkedin",
];

export function findBlockedTerm(prompt: string): string | null {
  const lower = prompt.toLowerCase();
  for (const term of BLOCKED_TERMS) {
    if (lower.includes(term)) return term;
  }
  return null;
}
