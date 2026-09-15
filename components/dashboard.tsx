"use client";

import React, { useState } from "react";
import { DirectDomainItem, ContextDomainItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Sparkles,
  Search,
  Plus,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Info,
  ArrowRight,
} from "lucide-react";

interface ToastMessage {
  id: number;
  text: string;
}

const PRESET_EXAMPLES = [
  {
    brand: "SwarnaSeva Finance",
    query: "I want to open a Gold loan business",
    label: "Gold Loan (SwarnaSeva)",
  },
  {
    brand: "ChaiCraft Artisan",
    query: "Organic tea cafe and artisanal brewing",
    label: "Artisan Tea (ChaiCraft)",
  },
  {
    brand: "PulseFit Studio",
    query: "High-intensity fitness training and athletic apparel",
    label: "Fitness Studio (PulseFit)",
  },
];

export function Dashboard() {
  const [brand, setBrand] = useState("SwarnaSeva Finance");
  const [query, setQuery] = useState("I want to open a Gold loan business");
  const [loading, setLoading] = useState(false);

  const [directItems, setDirectItems] = useState<DirectDomainItem[] | null>(null);
  const [contextItems, setContextItems] = useState<ContextDomainItem[] | null>(null);
  const [enrichedPhrases, setEnrichedPhrases] = useState<string[]>([]);

  const [directError, setDirectError] = useState<string | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = (message: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, text: message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  };

  const handleCompare = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!brand.trim() || !query.trim()) return;

    setLoading(true);
    setDirectError(null);
    setContextError(null);
    setDirectItems(null);
    setContextItems(null);
    setEnrichedPhrases([]);

    try {
      const [directRes, contextRes] = await Promise.all([
        fetch("/api/direct-suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: query.trim() }),
        }),
        fetch("/api/context-suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brand: brand.trim(), query: query.trim() }),
        }),
      ]);

      // Direct suggestions handling
      const directJson = await directRes.json();
      if (!directRes.ok || directJson.error) {
        setDirectError(directJson.error || "Failed to load direct suggestions");
      } else {
        setDirectItems(directJson.items || []);
      }

      // Context suggestions handling
      const contextJson = await contextRes.json();
      if (!contextRes.ok || contextJson.error) {
        setContextError(contextJson.error || "Failed to load context recommendations");
      } else {
        setContextItems(contextJson.items || []);
        if (contextJson.enrichedPhrases) {
          setEnrichedPhrases(contextJson.enrichedPhrases);
        }
      }
    } catch (err: any) {
      setDirectError("Network error contacting API route");
      setContextError("Network error contacting API route");
    } finally {
      setLoading(false);
    }
  };

  const getRelevanceVariant = (score: number) => {
    if (score >= 75) return "highRelevance";
    if (score >= 50) return "mediumRelevance";
    return "lowRelevance";
  };

  const getRiskVariant = (risk: string) => {
    if (risk === "Low") return "lowRisk";
    if (risk === "Medium") return "mediumRisk";
    return "highRisk";
  };

  return (
    <div className="min-h-screen bg-white text-neutral-900 flex flex-col font-sans">
      {/* Toast Notification Container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto bg-neutral-900 text-white px-4 py-2.5 rounded-lg shadow-lg text-sm flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toast.text}</span>
          </div>
        ))}
      </div>

      {/* Top Header Bar */}
      <header className="border-b border-neutral-200 bg-white sticky top-0 z-30 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-neutral-900 flex items-center justify-center text-white font-bold text-base shadow-xs">
              G
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold tracking-tight text-neutral-900 flex items-center gap-2">
                Domain Intelligence Layer
                <span className="text-xs font-normal text-neutral-500 hidden sm:inline">
                  — Context-Aware Suggestions
                </span>
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="muted" className="text-neutral-600 bg-neutral-100/80">
              GoDaddy Airo Prototype
            </Badge>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex-1 flex flex-col gap-8 w-full">
        {/* Intro / Problem Banner */}
        <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-neutral-600 mt-0.5 shrink-0" />
            <div className="text-sm text-neutral-700 leading-relaxed">
              <p className="font-semibold text-neutral-900 mb-0.5">
                The Disconnected Search Widget Problem
              </p>
              Traditional domain widgets take raw keyword queries and return generic, low-relevance, or scam-pattern domains.
              This prototype injects brand context via Gemini, then runs candidates through a deterministic risk + relevance scoring layer before fetching live GoDaddy availability.
            </div>
          </div>
        </div>

        {/* Input Form Section */}
        <section className="bg-white rounded-xl border border-neutral-200 p-6 shadow-xs">
          <form onSubmit={handleCompare} className="flex flex-col gap-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="brand-name-input"
                  className="text-xs font-semibold text-neutral-700 uppercase tracking-wider"
                >
                  Business name / brand
                </label>
                <Input
                  id="brand-name-input"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="e.g. SwarnaSeva Finance"
                  className="font-medium text-neutral-900"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="query-input"
                  className="text-xs font-semibold text-neutral-700 uppercase tracking-wider"
                >
                  What do you want to build?
                </label>
                <Input
                  id="query-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. I want to open a Gold loan business"
                  className="font-medium text-neutral-900"
                  required
                />
              </div>
            </div>

            {/* Quick preset chips & Compare button */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
                <span className="font-medium">Try scenario:</span>
                {PRESET_EXAMPLES.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setBrand(preset.brand);
                      setQuery(preset.query);
                    }}
                    className="px-2.5 py-1 rounded-md bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition-colors font-medium text-xs cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <Button
                id="compare-btn"
                type="submit"
                disabled={loading || !brand.trim() || !query.trim()}
                className="w-full sm:w-auto px-6 h-10 font-medium flex items-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Analyzing & Scoring...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    <span>Compare</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </section>

        {/* Comparison Grid: Two Columns */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* LEFT CARD: Direct GoDaddy Suggestions */}
          <Card className="border-neutral-200 shadow-xs bg-white">
            <CardHeader className="border-b border-neutral-100 pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold text-neutral-900">
                  Direct GoDaddy Suggestions
                </CardTitle>
                <Badge variant="muted" className="text-[11px] font-medium text-neutral-500">
                  Raw API Output
                </Badge>
              </div>
              <CardDescription className="text-xs text-neutral-500 mt-1">
                Raw keyword query, no brand context
              </CardDescription>
            </CardHeader>

            <CardContent className="p-4 sm:p-5 flex flex-col gap-3">
              {directError && (
                <Alert variant="destructive" className="my-2">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>GoDaddy Suggestions API Note</AlertTitle>
                  <AlertDescription>{directError}</AlertDescription>
                </Alert>
              )}

              {loading && (
                <div className="flex flex-col gap-3 py-2">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div
                      key={i}
                      className="p-3.5 rounded-lg border border-neutral-100 flex items-center justify-between"
                    >
                      <div className="flex flex-col gap-1.5 w-2/3">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/3" />
                      </div>
                      <Skeleton className="h-8 w-16" />
                    </div>
                  ))}
                </div>
              )}

              {!loading && !directItems && !directError && (
                <div className="py-12 text-center text-neutral-400 text-sm">
                  Click &ldquo;Compare&rdquo; above to query GoDaddy&apos;s direct suggestion endpoint.
                </div>
              )}

              {!loading && directItems && directItems.length === 0 && !directError && (
                <div className="py-8 text-center text-neutral-500 text-sm">
                  No suggestions returned from GoDaddy.
                </div>
              )}

              {!loading && directItems && directItems.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  {directItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg border border-neutral-200/90 hover:border-neutral-300 bg-neutral-50/30 transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="flex flex-col gap-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm sm:text-base text-neutral-900 truncate">
                            {item.domain}
                          </span>
                          <Badge variant="muted" className="text-[10px] py-0 px-1.5 font-normal">
                            Unscored
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-neutral-500">
                          {item.originalPrice && (
                            <span className="line-through text-neutral-400">
                              {item.originalPrice}
                            </span>
                          )}
                          <span className="font-semibold text-neutral-800">
                            {item.price || "$11.99"}
                          </span>
                          <span className="text-[11px] text-neutral-400">/ 1st yr</span>
                        </div>
                      </div>

                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 shrink-0 text-neutral-700 hover:text-neutral-900 border-neutral-300 hover:bg-neutral-100 cursor-pointer"
                        title="Add domain"
                        onClick={() =>
                          showToast(`Would proceed to registration flow for ${item.domain}`)
                        }
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* RIGHT CARD: Context-Aware Recommendations */}
          <Card className="border-neutral-200 shadow-xs bg-white">
            <CardHeader className="border-b border-neutral-100 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <CardTitle className="text-base font-semibold text-neutral-900">
                    Context-Aware Recommendations
                  </CardTitle>
                </div>
                <Badge variant="lowRisk" className="text-[11px] font-medium">
                  Enriched & Scored
                </Badge>
              </div>
              <CardDescription className="text-xs text-neutral-500 mt-1">
                Enriched with brand context + relevance/risk scoring
              </CardDescription>

              {/* Show enriched keyword phrases if available */}
              {enrichedPhrases.length > 0 && (
                <div className="mt-2.5 pt-2.5 border-t border-neutral-100 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-neutral-500 font-medium">Enriched queries:</span>
                  {enrichedPhrases.map((phrase, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-700 text-[11px] font-mono"
                    >
                      &ldquo;{phrase}&rdquo;
                    </span>
                  ))}
                </div>
              )}
            </CardHeader>

            <CardContent className="p-4 sm:p-5 flex flex-col gap-3">
              {contextError && (
                <Alert variant="destructive" className="my-2">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Recommendation Engine Note</AlertTitle>
                  <AlertDescription>{contextError}</AlertDescription>
                </Alert>
              )}

              {loading && (
                <div className="flex flex-col gap-3 py-2">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div
                      key={i}
                      className="p-3.5 rounded-lg border border-neutral-100 flex items-center justify-between"
                    >
                      <div className="flex flex-col gap-1.5 w-3/4">
                        <Skeleton className="h-4 w-2/3" />
                        <div className="flex gap-2">
                          <Skeleton className="h-4 w-20" />
                          <Skeleton className="h-4 w-16" />
                        </div>
                      </div>
                      <Skeleton className="h-8 w-16" />
                    </div>
                  ))}
                </div>
              )}

              {!loading && !contextItems && !contextError && (
                <div className="py-12 text-center text-neutral-400 text-sm">
                  Click &ldquo;Compare&rdquo; above to run the Context & Risk Intelligence pipeline.
                </div>
              )}

              {!loading && contextItems && contextItems.length === 0 && !contextError && (
                <div className="py-8 text-center text-neutral-500 text-sm">
                  No suitable recommendations matched the safety and relevance criteria.
                </div>
              )}

              {!loading && contextItems && contextItems.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  {contextItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg border border-neutral-200/90 hover:border-neutral-300 bg-neutral-50/20 transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="flex flex-col gap-1.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm sm:text-base text-neutral-900 truncate">
                            {item.domain}
                          </span>

                          {/* Relevance Badge */}
                          <Badge
                            variant={getRelevanceVariant(item.relevanceScore)}
                            className="text-[11px] py-0 px-1.5"
                          >
                            Relevance: {item.relevanceScore}
                          </Badge>

                          {/* Risk Badge */}
                          <Badge
                            variant={getRiskVariant(item.riskLevel)}
                            className="text-[11px] py-0 px-1.5"
                          >
                            Risk: {item.riskLevel}
                          </Badge>

                          {item.available && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Available
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-neutral-500">
                          <div className="flex items-center gap-1.5">
                            {item.renewalPrice && item.price && item.renewalPrice !== item.price && (
                              <span className="line-through text-neutral-400">
                                {item.renewalPrice}
                              </span>
                            )}
                            <span className="font-semibold text-neutral-800">
                              {item.price || "$11.99"}
                            </span>
                            <span className="text-[11px] text-neutral-400">/ 1st yr</span>
                          </div>

                          {item.reason && (
                            <span className="text-[11px] text-neutral-500 truncate max-w-[220px] sm:max-w-[320px]">
                              • {item.reason}
                            </span>
                          )}
                        </div>
                      </div>

                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 shrink-0 text-neutral-700 hover:text-neutral-900 border-neutral-300 hover:bg-neutral-100 cursor-pointer"
                        title="Add domain"
                        onClick={() =>
                          showToast(`Would proceed to registration flow for ${item.domain}`)
                        }
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Key Differences / Analysis Breakdown */}
        <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-xs">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-900 mb-4">
            How The Intelligence Layer Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-neutral-600 leading-relaxed">
            <div className="flex flex-col gap-1.5 p-3.5 rounded-lg bg-neutral-50/70 border border-neutral-100">
              <span className="font-bold text-neutral-900 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-neutral-900 text-white inline-flex items-center justify-center text-[10px]">
                  1
                </span>
                Context Enrichment
              </span>
              <p>
                Takes brand name & business intent to generate coherent multi-word search queries and direct candidate suggestions via Gemini.
              </p>
            </div>

            <div className="flex flex-col gap-1.5 p-3.5 rounded-lg bg-neutral-50/70 border border-neutral-100">
              <span className="font-bold text-neutral-900 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-neutral-900 text-white inline-flex items-center justify-center text-[10px]">
                  2
                </span>
                Deterministic Risk Scoring
              </span>
              <p>
                Flags scam-pattern keywords (e.g. &ldquo;vault&rdquo;, &ldquo;pledge&rdquo;), typosquats against major financial brands via Levenshtein distance, and penalizes high-abuse TLDs.
              </p>
            </div>

            <div className="flex flex-col gap-1.5 p-3.5 rounded-lg bg-neutral-50/70 border border-neutral-100">
              <span className="font-bold text-neutral-900 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-neutral-900 text-white inline-flex items-center justify-center text-[10px]">
                  3
                </span>
                Live GoDaddy Verification
              </span>
              <p>
                Filters out high-risk candidates, sorts top-relevance recommendations, and verifies live registry availability + real GoDaddy pricing.
              </p>
            </div>
          </div>
        </section>

        {/* Required Bottom Caption */}
        <footer className="mt-2 text-center text-xs text-neutral-500 leading-relaxed border-t border-neutral-200/80 pt-6 pb-4">
          Left: unmodified GoDaddy suggestion API. Right: same query enriched with brand context, then filtered through a relevance + risk scoring layer before availability is confirmed.
        </footer>
      </main>
    </div>
  );
}
