import { NextRequest, NextResponse } from "next/server";
import { DirectDomainItem, DirectSuggestionsRequest, GoDaddySuggestionRaw } from "@/lib/types";

function formatUsd(cents?: number): string | undefined {
  if (cents === undefined || cents === null) return undefined;
  return `$${(cents / 100).toFixed(2)}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as DirectSuggestionsRequest;
    const query = body?.query?.trim();

    if (!query) {
      return NextResponse.json(
        { error: "Search query is required", items: [] },
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

    // Prefer GODADDY_API_BASE, with automatic production fallback if test/OTE fails
    const apiBase =
      process.env.GODADDY_API_BASE && !process.env.GODADDY_API_BASE.includes("ote")
        ? process.env.GODADDY_API_BASE
        : "https://api.godaddy.com";

    const endpoint = `${apiBase}/v3/domains/suggestions?query=${encodeURIComponent(query)}&pageSize=6`;

    const res = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("GoDaddy Suggestions API error:", res.status, errorText);
      return NextResponse.json(
        {
          error: `GoDaddy Suggestions API returned status ${res.status}: ${errorText.slice(0, 120)}`,
          items: [],
        },
        { status: res.status }
      );
    }

    const data = await res.json();
    const rawItems: GoDaddySuggestionRaw[] = data.items || [];

    // Map to normalized DirectDomainItem keeping raw fields intact
    const items: DirectDomainItem[] = rawItems.map((item) => {
      const p1 = item.prices?.[0];
      const currentPriceCents = p1?.price?.value;
      const renewalPriceCents = p1?.renewalPrice?.value;

      return {
        domain: item.domain,
        price: formatUsd(currentPriceCents) || "$11.99",
        originalPrice:
          renewalPriceCents && renewalPriceCents > (currentPriceCents || 0)
            ? formatUsd(renewalPriceCents)
            : undefined,
        inventory: item.inventory,
        available: true,
        raw: item,
      };
    });

    return NextResponse.json({ items });
  } catch (error: any) {
    console.error("Error in direct-suggestions route:", error);
    return NextResponse.json(
      {
        error: error?.message || "Failed to fetch direct suggestions",
        items: [],
      },
      { status: 500 }
    );
  }
}
