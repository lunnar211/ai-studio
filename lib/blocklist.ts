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

// Extended moderation categories (see /acceptable-use and the moderation
// policy in README). Matching is deliberately broad and non-graphic: these
// are category keywords, not a list of explicit content. A refused prompt
// gets a plain message and the user can rephrase with an original concept.
// The blocklist is a first-pass guard, not a legal opinion, and prompts are
// never stored beyond an anonymised Job.inputSummary for abuse review.
export const BLOCKED_CATEGORIES: Record<string, string[]> = {
  // Copying an existing mark, logo or trade dress.
  trademark: [
    "logo of", "copy the logo", "same as", "official logo", "trademark",
    "brand logo", "recreate the logo",
  ],
  // Illegal activity.
  illegal: [
    "counterfeit", "fake id", "forged document", "phishing", "malware",
    "ransomware", "drug dealing", "weapon", "bomb", "explosive",
  ],
  // Sexual / abusive content.
  sexual: [
    "porn", "pornographic", "sexually explicit", "nude", "naked person",
    "erotic", "sex toy",
  ],
  // Harassment, hate and abuse.
  abusive: [
    "hate symbol", "nazi symbol", "swastika", "harass", "bully",
    "threatening", "racial slur",
  ],
};

export function findBlockedCategory(prompt: string): string | null {
  const lower = prompt.toLowerCase();
  for (const [category, terms] of Object.entries(BLOCKED_CATEGORIES)) {
    for (const term of terms) {
      if (lower.includes(term)) return category;
    }
  }
  return null;
}

// Combined check used by the logo route: brand terms first, then categories.
export function findBlocked(prompt: string): { term: string; category: string } | null {
  const term = findBlockedTerm(prompt);
  if (term) return { term, category: "brand" };
  const category = findBlockedCategory(prompt);
  if (category) return { term: category, category };
  return null;
}
