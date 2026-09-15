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

function formatUsd(cents?: number): string | undefined {
  if (cents === undefined || cents === null) return undefined;
  return `$${(cents / 100).toFixed(2)}`;
}

interface GeminiStepAResult {
  enrichedKeywords: string[];
  brandForwardDomains: string[];
}

/**
 * Call Gemini 2.5/2.0/1.5 Flash to generate enriched search phrases and brand-forward domain candidates
 */
async function callGeminiForEnrichment(
  brand: string,
  query: string,
  apiKey: string
): Promise<GeminiStepAResult> {
  const prompt = `You are a domain name branding intelligence expert for GoDaddy.
A user has the brand name: "${brand}"
Their business intent is: "${query}"

Generate:
1. 3 to 5 enriched search keyword phrases that combine the brand identity with the business intent (e.g. for brand "SwarnaSeva Finance" and intent "gold loan business" -> ["swarnaseva finance", "swarnaseva gold loan", "swarnaseva lending", "swarnaseva credit"]).
2. 3 to 5 direct brand-forward candidate domain names that clearly reflect the brand (e.g. ["swarnasevafinance.com", "swarnasevagold.com", "swarnaseva.in", "swarnasevalending.com"]).

Return ONLY valid JSON matching this exact structure:
{
  "enrichedKeywords": ["phrase1", "phrase2", "phrase3"],
  "brandForwardDomains": ["example1.com", "example2.in", "example3.com"]
}`;

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
      cache: "no-store",
    }
  );

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
}

/**
 * Single batch Gemini call for domain relevance scoring (Step C)
 */
async function callGeminiBatchRelevance(
  domains: string[],
  brand: string,
  query: string,
  apiKey: string
): Promise<Map<string, { score: number; reason: string }>> {
  const domainList = domains.join(", ");
  const prompt = `Evaluate the domain relevance for brand "${brand}" and business intent "${query}".
Domains to score: ${domainList}

For each domain, assign a relevance score from 0 to 100:
- High (75-100): clearly features the brand name or strong brand+intent synergy.
- Medium (45-74): generic intent match without strong brand identity, or partial brand match.
- Low (0-44): completely generic, off-topic, spammy, or lacking brand context.

Return ONLY a valid JSON array of objects:
[
  { "domain": "example.com", "relevanceScore": 88, "reason": "Includes core brand name and financial intent" }
]`;

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
      cache: "no-store",
    }
  );

  const resultMap = new Map<string, { score: number; reason: string }>();

  if (!res.ok) {
    return resultMap; // Fallback will take over
  }

  const json = await res.json();
  const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) return resultMap;

  try {
    const list = JSON.parse(rawText) as Array<{
      domain: string;
      relevanceScore: number;
      reason: string;
    }>;
    for (const item of list) {
      if (item.domain && typeof item.relevanceScore === "number") {
        resultMap.set(item.domain.toLowerCase(), {
          score: Math.min(100, Math.max(0, item.relevanceScore)),
          reason: item.reason || "Contextually aligned with brand and business category",
        });
      }
    }
  } catch (e) {
    console.warn("Failed to parse Gemini batch relevance scores:", e);
  }

  return resultMap;
}

/**
 * Fallback enrichment in case Gemini key is missing or encounters rate limiting
 */
function generateFallbackEnrichment(
  brand: string,
  query: string
): GeminiStepAResult {
  const brandClean = brand.toLowerCase().replace(/[^a-z0-9]/g, "");
  const intentTokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !["want", "open", "need", "build", "like", "business"].includes(t));

  const primaryKeyword = intentTokens[0] || "finance";
  const secondaryKeyword = intentTokens[1] || "hub";

  return {
    enrichedKeywords: [
      `${brand.toLowerCase()} ${primaryKeyword}`,
      `${brand.toLowerCase()} ${secondaryKeyword}`,
      `${brand.toLowerCase()} official`,
      `${brand.toLowerCase()} direct`,
    ],
    brandForwardDomains: [
      `${brandClean}.com`,
      `${brandClean}${primaryKeyword}.com`,
      `${brandClean}.in`,
      `${brandClean}${primaryKeyword}.in`,
      `${brandClean}official.com`,
    ],
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ContextSuggestionsRequest;
    const brand = body?.brand?.trim();
    const query = body?.query?.trim();

    if (!brand || !query) {
      return NextResponse.json(
        { error: "Both brand name and business intent query are required", items: [] },
        { status: 400 }
      );
    }

    const pat = process.env.GODADDY_PAT;
    if (!pat) {
      return NextResponse.json(
        { error: "GODADDY_PAT environment variable is not configured", items: [] },
        { status: 500 }
      );
    }

    const apiBase =
      process.env.GODADDY_API_BASE && !process.env.GODADDY_API_BASE.includes("ote")
        ? process.env.GODADDY_API_BASE
        : "https://api.godaddy.com";

    const geminiKey = process.env.GEMINI_API_KEY;

    // STEP A: Enrich keywords & generate brand-forward candidates using Gemini
    let stepAData: GeminiStepAResult;
    try {
      if (geminiKey) {
        stepAData = await callGeminiForEnrichment(brand, query, geminiKey);
      } else {
        stepAData = generateFallbackEnrichment(brand, query);
      }
    } catch (err: any) {
      console.warn("Step A Gemini call failed, using fallback:", err?.message);
      stepAData = generateFallbackEnrichment(brand, query);
    }

    const enrichedPhrases = stepAData.enrichedKeywords.slice(0, 4);
    const candidateSet = new Set<string>();

    // Add LLM direct brand-forward candidates
    for (const d of stepAData.brandForwardDomains) {
      candidateSet.add(d.toLowerCase());
    }

    // STEP B: Call GoDaddy suggestions for each enriched phrase
    const suggestionPromises = enrichedPhrases.map(async (phrase) => {
      try {
        const url = `${apiBase}/v3/domains/suggestions?query=${encodeURIComponent(phrase)}&pageSize=4`;
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${pat}`,
            Accept: "application/json",
          },
          cache: "no-store",
        });
        if (!res.ok) return [];
        const json = await res.json();
        return (json.items || []) as GoDaddySuggestionRaw[];
      } catch (e) {
        return [];
      }
    });

    const suggestionResults = await Promise.allSettled(suggestionPromises);
    const goDaddyPool: GoDaddySuggestionRaw[] = [];

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

    const allCandidates = Array.from(candidateSet);

    // STEP C: Run scoring (Relevance + Deterministic Risk)
    // Try batch Gemini relevance scoring, fallback to heuristic scoring
    let geminiScores = new Map<string, { score: number; reason: string }>();
    if (geminiKey) {
      try {
        geminiScores = await callGeminiBatchRelevance(
          allCandidates.slice(0, 25),
          brand,
          query,
          geminiKey
        );
      } catch (e) {
        console.warn("Gemini batch relevance scoring skipped:", e);
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

    // STEP D: Filter out candidates with Risk = High AND Relevance < 40
    // Rank remaining by relevance score descending
    const filteredCandidates = scoredCandidates
      .filter((c) => !(c.riskLevel === "High" && c.relevanceScore < 40))
      .sort((a, b) => b.relevanceScore - a.relevanceScore);

    // STEP E: Check real availability & price via GoDaddy check-availability for top candidates
    // Reuse prices and availability from goDaddyPool if already fetched to minimize latency
    const topBatch = filteredCandidates.slice(0, 8);
    const poolMap = new Map<string, GoDaddySuggestionRaw>();
    for (const g of goDaddyPool) {
      if (g.domain) poolMap.set(g.domain.toLowerCase(), g);
    }
    const verifiedItems: ContextDomainItem[] = [];

    const availabilityPromises = topBatch.map(async (candidate) => {
      const lowerDomain = candidate.domain.toLowerCase();
      const existingInPool = poolMap.get(lowerDomain);

      // If already present in suggestions pool, we already have real pricing and inventory
      if (existingInPool && existingInPool.prices && existingInPool.prices.length > 0) {
        const p1 = existingInPool.prices[0];
        return {
          domain: candidate.domain,
          relevanceScore: candidate.relevanceScore,
          riskLevel: candidate.riskLevel,
          available: true,
          price: formatUsd(p1?.price?.value) || "$11.99",
          renewalPrice: formatUsd(p1?.renewalPrice?.value) || "$18.99",
          reason: candidate.reason,
        };
      }

      // Otherwise, call GoDaddy check-availability
      try {
        const url = `${apiBase}/v3/domains/check-availability?domain=${encodeURIComponent(candidate.domain)}`;
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${pat}`,
            Accept: "application/json",
          },
          cache: "no-store",
        });

        if (!res.ok) {
          return {
            domain: candidate.domain,
            relevanceScore: candidate.relevanceScore,
            riskLevel: candidate.riskLevel,
            available: true,
            price: "$11.99",
            renewalPrice: "$18.99",
            reason: candidate.reason,
          };
        }

        const data = await res.json();
        const p1 = data.prices?.[0];
        const currentPrice = p1?.price?.value;
        const renewalPrice = p1?.renewalPrice?.value;

        return {
          domain: candidate.domain,
          relevanceScore: candidate.relevanceScore,
          riskLevel: candidate.riskLevel,
          available: Boolean(data.available),
          price: formatUsd(currentPrice) || "$11.99",
          renewalPrice: formatUsd(renewalPrice) || "$18.99",
          reason: candidate.reason,
        };
      } catch (err) {
        return {
          domain: candidate.domain,
          relevanceScore: candidate.relevanceScore,
          riskLevel: candidate.riskLevel,
          available: true,
          price: "$11.99",
          renewalPrice: "$18.99",
          reason: candidate.reason,
        };
      }
    });

    const availabilityResults = await Promise.allSettled(availabilityPromises);

    for (const res of availabilityResults) {
      if (res.status === "fulfilled" && res.value) {
        // Keep available ones; if unavailable, only include if we don't have enough
        if (res.value.available) {
          verifiedItems.push(res.value);
        }
      }
    }

    // If less than 6 available, include unavailable or remainder to fill up to 6
    if (verifiedItems.length < 6) {
      for (const res of availabilityResults) {
        if (res.status === "fulfilled" && res.value && !verifiedItems.some((v) => v.domain === res.value.domain)) {
          verifiedItems.push(res.value);
          if (verifiedItems.length >= 6) break;
        }
      }
    }

    const finalResults = verifiedItems.slice(0, 6);

    return NextResponse.json({
      items: finalResults,
      enrichedPhrases,
      generatedCount: allCandidates.length,
    } as ContextSuggestionsResponse);
  } catch (error: any) {
    console.error("Error in context-suggestions route:", error);
    return NextResponse.json(
      {
        error: error?.message || "Failed to process context-aware recommendations",
        items: [],
      },
      { status: 500 }
    );
  }
}
