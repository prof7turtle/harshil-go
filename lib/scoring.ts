import { RiskLevel } from "./types";

// Target brands commonly abused for typosquatting / phishing
export const WELL_KNOWN_BRANDS = [
  "godaddy",
  "paypal",
  "google",
  "microsoft",
  "amazon",
  "apple",
  "stripe",
  "chase",
  "wellsfargo",
  "fidelity",
  "binance",
  "coinbase",
  "barclays",
  "hsbc",
  "goldmansachs",
  "revolut",
  "muthoot",
  "manappuram",
  "hdfc",
  "icici",
];

// Urgency and scam-pattern keywords commonly seen in spam/predatory domains
export const SCAM_URGENCY_KEYWORDS = [
  "vault",
  "pledge",
  "cash",
  "quick",
  "fast",
  "instant",
  "secure",
  "safe",
  "loan",
  "lending",
  "credit",
  "money",
  "funds",
  "pawn",
  "claim",
  "reward",
  "urgent",
  "direct",
];

// High-risk TLDs frequently abused for cheap disposable scam sites
export const HIGH_RISK_TLDS = [
  ".xyz",
  ".site",
  ".online",
  ".top",
  ".club",
  ".click",
  ".live",
  ".work",
  ".vip",
  ".buzz",
  ".cc",
];

/**
 * Standard Levenshtein distance between two strings
 */
export function levenshtein(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix = Array.from({ length: an + 1 }, () => new Array(bn + 1).fill(0));

  for (let i = 0; i <= an; i++) matrix[i][0] = i;
  for (let j = 0; j <= bn; j++) matrix[0][j] = j;

  for (let i = 1; i <= an; i++) {
    for (let j = 1; j <= bn; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[an][bn];
}

/**
 * Extracts base domain name (without TLD extension)
 */
export function getDomainBase(domain: string): { base: string; tld: string } {
  const parts = domain.toLowerCase().trim().split(".");
  if (parts.length <= 1) {
    return { base: domain.toLowerCase(), tld: "" };
  }
  const base = parts[0];
  const tld = "." + parts.slice(1).join(".");
  return { base, tld };
}

/**
 * Deterministic Risk Score evaluator
 * Checks:
 * 1. Urgency / scam keyword presence without brand tokens
 * 2. Levenshtein typosquatting against known major brands
 * 3. TLD risk weighting
 */
export function calculateRisk(
  domain: string,
  brandName: string
): { riskLevel: RiskLevel; reasons: string[] } {
  const reasons: string[] = [];
  const { base, tld } = getDomainBase(domain);
  const cleanBase = base.replace(/[^a-z0-9]/g, "");

  // Brand tokenization
  const brandTokens = brandName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((t) => t.length >= 3);

  const containsBrandToken = brandTokens.some(
    (token) => cleanBase.includes(token) || levenshtein(cleanBase, token) <= 1
  );

  let riskScore = 0; // 0 = Low, 1-2 = Medium, 3+ = High

  // 1. Typosquatting Check: Levenshtein distance against famous brands
  for (const brand of WELL_KNOWN_BRANDS) {
    // If exact match or edit distance is 1 or 2 on words of sufficient length
    const dist = levenshtein(cleanBase, brand);
    if (dist > 0 && dist <= 2 && Math.abs(cleanBase.length - brand.length) <= 2) {
      riskScore += 3;
      reasons.push(`Possible typosquat of brand "${brand}" (edit distance: ${dist})`);
      break;
    }
  }

  // 2. Scam/Urgency pattern check
  const matchedScamWords = SCAM_URGENCY_KEYWORDS.filter((word) =>
    cleanBase.includes(word)
  );

  if (matchedScamWords.length >= 2 && !containsBrandToken) {
    riskScore += 2;
    reasons.push(
      `Multiple generic urgency/lending keywords (${matchedScamWords.join(", ")}) without brand identity`
    );
  } else if (matchedScamWords.length === 1 && !containsBrandToken) {
    riskScore += 1;
    reasons.push(`Generic commercial keyword (${matchedScamWords[0]}) with no brand identity`);
  }

  // 3. TLD Risk Weighting
  const isHighRiskTLD = HIGH_RISK_TLDS.some((ext) => tld.endsWith(ext));
  if (isHighRiskTLD) {
    riskScore += 1;
    reasons.push(`High-abuse/cheap TLD extension (${tld})`);
  }

  // If brand is strongly represented and not typosquatting, mitigate score
  if (containsBrandToken && riskScore < 3) {
    riskScore = Math.max(0, riskScore - 1);
  }

  let riskLevel: RiskLevel = "Low";
  if (riskScore >= 3) {
    riskLevel = "High";
  } else if (riskScore >= 1) {
    riskLevel = "Medium";
  }

  if (reasons.length === 0) {
    reasons.push("Brand consistent, standard TLD, no spoofing detected");
  }

  return { riskLevel, reasons };
}

/**
 * Heuristic relevance scoring (fallback or baseline)
 * Scores 0 - 100 based on brand overlap and business query match
 */
export function calculateHeuristicRelevance(
  domain: string,
  brandName: string,
  intentQuery: string
): { score: number; reason: string } {
  const { base } = getDomainBase(domain);
  const cleanBase = base.replace(/[^a-z0-9]/g, "").toLowerCase();

  const brandTokens = brandName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  const intentTokens = intentQuery
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !["want", "open", "need", "build", "like"].includes(t));

  let brandMatchScore = 0;
  let brandMatches = 0;
  for (const token of brandTokens) {
    if (cleanBase.includes(token)) {
      brandMatches++;
      brandMatchScore += Math.min(50, token.length * 8);
    }
  }

  let intentMatchScore = 0;
  let intentMatches = 0;
  for (const token of intentTokens) {
    if (cleanBase.includes(token)) {
      intentMatches++;
      intentMatchScore += Math.min(30, token.length * 6);
    }
  }

  let totalScore = Math.min(100, Math.round(brandMatchScore * 0.65 + intentMatchScore * 0.35));

  // If both brand and intent match, bonus
  if (brandMatches > 0 && intentMatches > 0) {
    totalScore = Math.min(100, totalScore + 15);
  }

  // If no brand match at all, cap at 45
  if (brandMatches === 0) {
    totalScore = Math.min(45, totalScore);
  }

  // Floor at 15
  totalScore = Math.max(15, totalScore);

  let reason = "";
  if (brandMatches > 0 && intentMatches > 0) {
    reason = "Strong combination of core brand name and commercial intent";
  } else if (brandMatches > 0) {
    reason = "Directly incorporates primary brand identity";
  } else if (intentMatches > 0) {
    reason = "Matches business category but lacks brand identity";
  } else {
    reason = "Generic keyword suggestion with low semantic relevance";
  }

  return { score: totalScore, reason };
}
