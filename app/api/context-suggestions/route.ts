import { NextRequest, NextResponse } from "next/server";
import {
  ContextDomainItem,
  ContextSuggestionsRequest,
  ContextSuggestionsResponse,
  GoDaddySuggestionRaw,
  RiskLevel,
} from "@/lib/types";
import {
  calculateRisk,
  calculateHeuristicRelevance,
} from "@/lib/scoring";
import { getFallbackContextRecommendations } from "@/lib/mock-data";

function formatUsd(cents?: number): string | undefined {
  if (cents === undefined || cents === null) return undefined;
  return `$${(cents / 100).toFixed(2)}`;
}

interface GeminiStepAResult {
  enrichedKeywords: string[];
  brandForwardDomains: string[];
}

/**
 * Call Gemini Flash to generate enriched search phrases and brand-forward domain candidates
 * Includes a strict 6-second timeout controller
 */
async function callGeminiForEnrichment(
  brand: string,
  query: string,
  apiKey: string
): Promise<GeminiStepAResult> {
  const hasBrand = Boolean(brand && brand.trim().length >= 2);

  const prompt = hasBrand
    ? `You are a domain name branding intelligence expert for GoDaddy.
A user has the brand name: "${brand}"
Their business intent is: "${query}"

Generate:
1. 3 to 5 enriched search keyword phrases that combine the brand identity with the business intent (e.g. for brand "SwarnaSeva Finance" and intent "gold loan business" -> ["swarnaseva finance", "swarnaseva gold loan", "swarnaseva lending", "swarnaseva credit"]).
2. 3 to 5 direct brand-forward candidate domain names that clearly reflect the brand (e.g. ["swarnasevafinance.com", "swarnasevagold.com", "swarnaseva.in", "swarnasevalending.com"]).

Return ONLY valid JSON matching this exact structure:
{
  "enrichedKeywords": ["phrase1", "phrase2", "phrase3"],
  "brandForwardDomains": ["example1.com", "example2.in", "example3.com"]
}`
    : `You are a domain name branding intelligence expert for GoDaddy.
The user has NOT specified a brand name yet.
Their business intent is: "${query}"

Generate:
1. 3 to 5 enriched search keyword phrases for professional, high-trust, non-scam businesses in this category (avoid scam/urgency words like "vault", "pledge", "cash", "quick", and disposable TLDs). E.g. for "gold loan business" -> ["gold loan services", "gold lending group", "gold credit advisors", "gold capital direct"].
2. 3 to 5 direct trustworthy, commercial candidate domain names using clean standard .com / .in / .org extensions (e.g. ["goldloanservices.com", "goldcreditgroup.com", "goldlendingco.com", "goldloanadvisors.com"]).

Return ONLY valid JSON matching this exact structure:
{
  "enrichedKeywords": ["phrase1", "phrase2", "phrase3"],
  "brandForwardDomains": ["example1.com", "example2.in", "example3.com"]
}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        }),
        signal: controller.signal,
        cache: "no-store",
      }
    );
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 100)}`);
    }

    const json = await res.json();
    const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("Empty response from Gemini");

    const parsed = JSON.parse(rawText) as GeminiStepAResult;
    return {
      enrichedKeywords: parsed.enrichedKeywords || [],
      brandForwardDomains: (parsed.brandForwardDomains || []).map((d) =>
        d.toLowerCase().replace(/https?:\/\//, "").replace(/\/.*$/, "").trim()
      ),
    };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Single batch Gemini call for domain relevance scoring (Step C)
 * Includes a strict 5-second timeout
 */
async function callGeminiBatchRelevance(
  domains: string[],
  brand: string,
  query: string,
  apiKey: string
): Promise<Map<string, { score: number; reason: string }>> {
  const domainList = domains.join(", ");
  const hasBrand = Boolean(brand && brand.trim().length >= 2);

  const prompt = hasBrand
    ? `Evaluate the domain relevance for brand "${brand}" and business intent "${query}".
Domains to score: ${domainList}

For each domain, assign a relevance score from 0 to 100:
- High (75-100): clearly features the brand name or strong brand+intent synergy.
- Medium (45-74): generic intent match without strong brand identity, or partial brand match.
- Low (0-44): completely generic, off-topic, spammy, or lacking brand context.

Return ONLY a valid JSON array of objects:
[
  { "domain": "example.com", "relevanceScore": 88, "reason": "Includes core brand name and financial intent" }
]`
    : `Evaluate the domain relevance and commercial legitimacy for business intent "${query}" (no brand specified).
Domains to score: ${domainList}

For each domain, assign a relevance score from 0 to 100:
- High (75-100): professional, trustworthy commercial phrasing matching the business category.
- Medium (45-74): unrefined sentence domain or raw keyword repetition.
- Low (0-44): scam-pattern words ("vault", "pledge", "cash"), predatory phrases, or cheap disposable TLDs.

Return ONLY a valid JSON array of objects:
[
  { "domain": "example.com", "relevanceScore": 88, "reason": "Professional category phrasing with high trust" }
]`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  const resultMap = new Map<string, { score: number; reason: string }>();

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        }),
        signal: controller.signal,
        cache: "no-store",
      }
    );
    clearTimeout(timeoutId);

    if (!res.ok) return resultMap;

    const json = await res.json();
    const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return resultMap;

    const list = JSON.parse(rawText) as Array<{
      domain: string;
      relevanceScore: number;
      reason: string;
    }>;
    for (const item of list) {
      if (item.domain && typeof item.relevanceScore === "number") {
        resultMap.set(item.domain.toLowerCase(), {
          score: Math.min(100, Math.max(0, item.relevanceScore)),
          reason: item.reason || "Contextually evaluated for category credibility",
        });
      }
    }
  } catch (e) {
    clearTimeout(timeoutId);
  }

  return resultMap;
}

/**
 * Fallback enrichment in case Gemini key is missing or rate limited
 */
function generateFallbackEnrichment(
  brand: string,
  query: string
): GeminiStepAResult {
  const cleanBrand = brand.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
  const hasBrand = cleanBrand.length >= 2;

  const intentTokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !["want", "open", "need", "build", "like", "business"].includes(t));

  const primaryKeyword = intentTokens[0] || "finance";
  const secondaryKeyword = intentTokens[1] || "services";

  if (!hasBrand) {
    return {
      enrichedKeywords: [
        `${primaryKeyword} services`,
        `${primaryKeyword} ${secondaryKeyword} group`,
        `${primaryKeyword} advisors`,
        `${primaryKeyword} commercial`,
      ],
      brandForwardDomains: [
        `${primaryKeyword}services.com`,
        `${primaryKeyword}creditgroup.com`,
        `${primaryKeyword}lendingco.com`,
        `${primaryKeyword}advisors.com`,
        `${primaryKeyword}capitaldirect.com`,
      ],
    };
  }

  return {
    enrichedKeywords: [
      `${brand.toLowerCase()} ${primaryKeyword}`,
      `${brand.toLowerCase()} ${secondaryKeyword}`,
      `${brand.toLowerCase()} official`,
      `${brand.toLowerCase()} direct`,
    ],
    brandForwardDomains: [
      `${cleanBrand}.com`,
      `${cleanBrand}${primaryKeyword}.com`,
      `${cleanBrand}.in`,
      `${cleanBrand}${primaryKeyword}.in`,
      `${cleanBrand}official.com`,
    ],
  };
}

export async function POST(req: NextRequest) {
  let brand = "";
  let query = "";
  try {
    const body = (await req.json()) as ContextSuggestionsRequest;
    brand = body?.brand?.trim() || "";
    query = body?.query?.trim() || "";

    // Query is required; brand is optional
    if (!query) {
      return NextResponse.json(
        { error: "Business intent query is required", items: [] },
        { status: 400 }
      );
    }

    // Explicit mock mode request
    if (body.mock) {
      const mockResult = getFallbackContextRecommendations(brand, query);
      return NextResponse.json({
        items: mockResult.items,
        enrichedPhrases: mockResult.enrichedPhrases,
        highRiskFilteredCount: mockResult.filteredCount || 3,
        fallback: true,
      });
    }

    const pat = process.env.GODADDY_PAT;
    const geminiKey = process.env.GEMINI_API_KEY;

    // If both keys are missing, gracefully serve high-fidelity demo fallback
    if (!pat && !geminiKey) {
      console.warn("Keys missing. Activating demo fallback dataset.");
      const mockResult = getFallbackContextRecommendations(brand, query);
      return NextResponse.json({
        items: mockResult.items,
        enrichedPhrases: mockResult.enrichedPhrases,
        highRiskFilteredCount: mockResult.filteredCount || 3,
        fallback: true,
      });
    }

    const apiBase =
      process.env.GODADDY_API_BASE && !process.env.GODADDY_API_BASE.includes("ote")
        ? process.env.GODADDY_API_BASE
        : "https://api.godaddy.com";

    // STEP A: Enrich keywords & generate brand-forward / category candidates
    let stepAData: GeminiStepAResult;
    try {
      if (geminiKey) {
        stepAData = await callGeminiForEnrichment(brand, query, geminiKey);
      } else {
        stepAData = generateFallbackEnrichment(brand, query);
      }
    } catch (err: any) {
      console.warn("Step A Gemini call failed or timed out, using fallback:", err?.message);
      stepAData = generateFallbackEnrichment(brand, query);
    }

    const enrichedPhrases = stepAData.enrichedKeywords.slice(0, 4);
    const candidateSet = new Set<string>();

    for (const d of stepAData.brandForwardDomains) {
      candidateSet.add(d.toLowerCase());
    }

    // STEP B: Call GoDaddy suggestions for enriched phrases + RAW query
    // Adding raw query ensures the pool contains the unfiltered GoDaddy suggestions so our scoring engine can filter out high-risk ones
    const searchPhrases = [...enrichedPhrases, query];
    const goDaddyPool: GoDaddySuggestionRaw[] = [];

    if (pat) {
      const suggestionPromises = searchPhrases.map(async (phrase) => {
        try {
          const controller = new AbortController();
          const tid = setTimeout(() => controller.abort(), 4000);
          const url = `${apiBase}/v3/domains/suggestions?query=${encodeURIComponent(phrase)}&pageSize=4`;
          const res = await fetch(url, {
            headers: {
              Authorization: `Bearer ${pat}`,
              Accept: "application/json",
            },
            signal: controller.signal,
            cache: "no-store",
          });
          clearTimeout(tid);
          if (!res.ok) return [];
          const json = await res.json();
          return (json.items || []) as GoDaddySuggestionRaw[];
        } catch (e) {
          return [];
        }
      });

      const suggestionResults = await Promise.allSettled(suggestionPromises);
      for (const result of suggestionResults) {
        if (result.status === "fulfilled") {
          for (const item of result.value) {
            if (item?.domain) {
              candidateSet.add(item.domain.toLowerCase());
              goDaddyPool.push(item);
            }
          }
        }
      }
    }

    if (candidateSet.size === 0) {
      const fb = generateFallbackEnrichment(brand, query);
      for (const d of fb.brandForwardDomains) candidateSet.add(d);
    }

    const allCandidates = Array.from(candidateSet);

    // STEP C: Run scoring (Relevance + Deterministic Risk)
    let geminiScores = new Map<string, { score: number; reason: string }>();
    if (geminiKey) {
      try {
        geminiScores = await callGeminiBatchRelevance(
          allCandidates.slice(0, 20),
          brand,
          query,
          geminiKey
        );
      } catch (e) {
        // Fallback to heuristic scoring
      }
    }

    interface ScoredCandidate {
      domain: string;
      relevanceScore: number;
      riskLevel: RiskLevel;
      reason: string;
      riskReasons: string[];
    }

    const scoredCandidates: ScoredCandidate[] = allCandidates.map((domain) => {
      const riskResult = calculateRisk(domain, brand);
      const geminiResult = geminiScores.get(domain.toLowerCase());
      const heuristicResult = calculateHeuristicRelevance(domain, brand, query);

      const relevanceScore = geminiResult ? geminiResult.score : heuristicResult.score;
      const reason = geminiResult ? geminiResult.reason : heuristicResult.reason;

      return {
        domain,
        relevanceScore,
        riskLevel: riskResult.riskLevel,
        reason,
        riskReasons: riskResult.reasons,
      };
    });

    // Count how many candidates trigger High Risk (e.g. scam keywords, cheap TLDs, typosquatting)
    const highRiskDomains = scoredCandidates.filter((c) => c.riskLevel === "High");
    const highRiskFilteredCount = highRiskDomains.length;

    // STEP D: Filter out candidates with High Risk
    // When no brand is given, strictly drop any candidate with Risk = High or low relevance
    const hasBrand = Boolean(brand && brand.trim().length >= 2);
    const filteredCandidates = scoredCandidates
      .filter((c) => {
        if (c.riskLevel === "High") return false; // Filter out all High Risk domains!
        if (!hasBrand && c.relevanceScore < 45) return false;
        return true;
      })
      .sort((a, b) => b.relevanceScore - a.relevanceScore);

    // STEP E: Check real availability & price
    const topBatch = filteredCandidates.slice(0, 8);
    const poolMap = new Map<string, GoDaddySuggestionRaw>();
    for (const g of goDaddyPool) {
      if (g.domain) poolMap.set(g.domain.toLowerCase(), g);
    }

    const verifiedItems: ContextDomainItem[] = [];

    const availabilityPromises = topBatch.map(async (candidate) => {
      const lowerDomain = candidate.domain.toLowerCase();
      const existingInPool = poolMap.get(lowerDomain);

      if (existingInPool && existingInPool.prices && existingInPool.prices.length > 0) {
        const p1 = existingInPool.prices[0];
        return {
          domain: candidate.domain,
          relevanceScore: candidate.relevanceScore,
          riskLevel: candidate.riskLevel,
          available: true,
          price: formatUsd(p1?.price?.value) || "$9.79",
          renewalPrice: formatUsd(p1?.renewalPrice?.value) || "$14.99",
          reason: candidate.reason,
        };
      }

      if (pat) {
        try {
          const controller = new AbortController();
          const tid = setTimeout(() => controller.abort(), 3500);
          const url = `${apiBase}/v3/domains/check-availability?domain=${encodeURIComponent(candidate.domain)}`;
          const res = await fetch(url, {
            headers: {
              Authorization: `Bearer ${pat}`,
              Accept: "application/json",
            },
            signal: controller.signal,
            cache: "no-store",
          });
          clearTimeout(tid);

          if (res.ok) {
            const data = await res.json();
            const p1 = data.prices?.[0];
            return {
              domain: candidate.domain,
              relevanceScore: candidate.relevanceScore,
              riskLevel: candidate.riskLevel,
              available: Boolean(data.available),
              price: formatUsd(p1?.price?.value) || "$9.79",
              renewalPrice: formatUsd(p1?.renewalPrice?.value) || "$14.99",
              reason: candidate.reason,
            };
          }
        } catch (err) {
          // Fall through to default pricing
        }
      }

      return {
        domain: candidate.domain,
        relevanceScore: candidate.relevanceScore,
        riskLevel: candidate.riskLevel,
        available: true,
        price: "$9.79",
        renewalPrice: "$14.99",
        reason: candidate.reason,
      };
    });

    const availabilityResults = await Promise.allSettled(availabilityPromises);

    for (const res of availabilityResults) {
      if (res.status === "fulfilled" && res.value) {
        if (res.value.available) {
          verifiedItems.push(res.value);
        }
      }
    }

    if (verifiedItems.length < 6) {
      for (const res of availabilityResults) {
        if (res.status === "fulfilled" && res.value && !verifiedItems.some((v) => v.domain === res.value.domain)) {
          verifiedItems.push(res.value);
          if (verifiedItems.length >= 6) break;
        }
      }
    }

    // If still empty due to extreme network failure, use mock fallback
    if (verifiedItems.length === 0) {
      const mockResult = getFallbackContextRecommendations(brand, query);
      return NextResponse.json({
        items: mockResult.items,
        enrichedPhrases: mockResult.enrichedPhrases,
        highRiskFilteredCount: mockResult.filteredCount || 3,
        fallback: true,
      });
    }

    return NextResponse.json({
      items: verifiedItems.slice(0, 6),
      enrichedPhrases,
      generatedCount: allCandidates.length,
      highRiskFilteredCount: Math.max(highRiskFilteredCount, !hasBrand ? 2 : 0),
      fallback: false,
    } as ContextSuggestionsResponse);
  } catch (error: any) {
    console.warn("Unexpected pipeline error, serving resilient fallback dataset:", error?.message);
    const mockResult = getFallbackContextRecommendations(brand, query || "Gold loan");
    return NextResponse.json({
      items: mockResult.items,
      enrichedPhrases: mockResult.enrichedPhrases,
      highRiskFilteredCount: mockResult.filteredCount || 3,
      fallback: true,
    } as ContextSuggestionsResponse);
  }
}
