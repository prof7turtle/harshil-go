import { NextRequest, NextResponse } from "next/server";
import { DirectDomainItem, DirectSuggestionsRequest, GoDaddySuggestionRaw } from "@/lib/types";
import { getFallbackDirectSuggestions } from "@/lib/mock-data";

function formatUsd(cents?: number): string | undefined {
  if (cents === undefined || cents === null) return undefined;
  return `$${(cents / 100).toFixed(2)}`;
}

export async function POST(req: NextRequest) {
  let query = "";
  try {
    const body = (await req.json()) as DirectSuggestionsRequest;
    query = body?.query?.trim() || "";

    if (!query) {
      return NextResponse.json(
        { error: "Search query is required", items: [] },
        { status: 400 }
      );
    }

    // Explicit mock mode request
    if (body.mock) {
      const items = getFallbackDirectSuggestions(query);
      return NextResponse.json({ items, fallback: true });
    }

    const pat = process.env.GODADDY_PAT;
    if (!pat) {
      console.warn("GODADDY_PAT missing. Using fallback mock dataset.");
      const items = getFallbackDirectSuggestions(query);
      return NextResponse.json({ items, fallback: true });
    }

    // Prefer GODADDY_API_BASE, with automatic production fallback if test/OTE fails
    const apiBase =
      process.env.GODADDY_API_BASE && !process.env.GODADDY_API_BASE.includes("ote")
        ? process.env.GODADDY_API_BASE
        : "https://api.godaddy.com";

    const endpoint = `${apiBase}/v3/domains/suggestions?query=${encodeURIComponent(query)}&pageSize=6`;

    // Add 6-second timeout controller so an unresponsive API call doesn't hang the demo
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorText = await res.text();
      console.warn("GoDaddy API returned non-OK status. Activating fallback mock data:", res.status, errorText);
      const items = getFallbackDirectSuggestions(query);
      return NextResponse.json({ items, fallback: true });
    }

    const data = await res.json();
    const rawItems: GoDaddySuggestionRaw[] = data.items || [];

    if (rawItems.length === 0) {
      const items = getFallbackDirectSuggestions(query);
      return NextResponse.json({ items, fallback: true });
    }

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

    return NextResponse.json({ items, fallback: false });
  } catch (error: any) {
    console.warn("Error or timeout in direct-suggestions route. Activating resilient fallback:", error?.message);
    const items = getFallbackDirectSuggestions(query || "business");
    return NextResponse.json({ items, fallback: true });
  }
}
