import { z } from "zod";

export const productSearchInputSchema = z.strictObject({
  query: z.string().trim().min(1).max(300).describe("What the buyer wants, in their words, such as \"ceramic coffee mug\"."),
  limit: z.number().int().min(1).max(10).default(5),
  maxPriceMinor: z.string().regex(/^(0|[1-9]\d{0,8})$/).optional().describe("Leave out offers above this price, in integer USD cents."),
});
export type ProductSearchInput = z.infer<typeof productSearchInputSchema>;
export type ProductOffer = {
  id: string; title: string; variant: string | null; priceMinor: string; currency: "USD"; available: boolean;
  store: { name: string; domain: string }; imageUrl: string | null;
  /** The store's own product page, for `purchase`. Null when it could not be found. */
  productUrl: string | null;
  /** The store's home page. A `browser` checkout starts here and finds the item by its title. */
  storeUrl: string;
  /** `shopify`: the fast storefront checkout from productUrl. `browser`: a browser agent finds the item from storeUrl. */
  checkout: "shopify" | "browser";
};

const money = z.object({ amount: z.number().int().nonnegative(), currency: z.string() });
const catalogSchema = z.object({ products: z.array(z.object({
  id: z.string(), title: z.string(),
  media: z.array(z.object({ url: z.string() })).optional(),
  variants: z.array(z.object({
    id: z.string(), title: z.string().optional(), price: money, availability: z.object({ available: z.boolean() }).optional(),
    seller: z.object({ name: z.string(), domain: z.string(), url: z.string().optional() }),
    media: z.array(z.object({ url: z.string() })).optional(),
  })),
})) });
const rpcSchema = z.object({ result: z.object({ structuredContent: z.unknown(), isError: z.boolean().optional() }) });
const suggestSchema = z.object({ resources: z.object({ results: z.object({ products: z.array(z.object({
  title: z.string(), url: z.string(), price: z.string().optional() })) }) }) });

const CHANNEL3_UCP = "https://ucp.trychannel3.com/mcp";
const host = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Channel3's cross-store catalog through its keyless UCP endpoint. Each store's offer is one result. */
export async function searchCatalog(input: ProductSearchInput, request: typeof fetch = fetch) {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call",
    params: { name: "search_catalog", arguments: { catalog: { query: input.query, pagination: { limit: Math.min(20, input.limit * 3) } } } } });
  // The keyless tier throttles bursts; retry throttled and server errors twice with backoff.
  let response: Response | null = null;
  for (const wait of [0, 1000, 3000]) {
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    response = await request(CHANNEL3_UCP, { method: "POST", signal: AbortSignal.timeout(10000), body,
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" } }).catch(() => null);
    if (response && response.status !== 429 && response.status < 500) break;
  }
  if (!response?.ok) throw new Error(`Product search failed with HTTP ${response?.status ?? "error"}`);
  const rpc = rpcSchema.parse(await response.json());
  if (rpc.result.isError) throw new Error("Product search failed");
  const max = input.maxPriceMinor === undefined ? null : Number(input.maxPriceMinor);
  return catalogSchema.parse(rpc.result.structuredContent).products.flatMap(product => product.variants
    .filter(variant => variant.price.currency === "USD" && host.test(variant.seller.domain) && (max === null || variant.price.amount <= max))
    .map(variant => ({ id: variant.id, title: product.title, variant: variant.title && variant.title !== product.title ? variant.title : null,
      priceMinor: String(variant.price.amount), currency: "USD" as const, available: variant.availability?.available ?? false,
      store: { name: variant.seller.name, domain: variant.seller.domain },
      storeUrl: /^https:\/\//.test(variant.seller.url ?? "") ? new URL(variant.seller.url!).origin : `https://${variant.seller.domain}`,
      imageUrl: variant.media?.[0]?.url ?? product.media?.[0]?.url ?? null })));
}

/**
 * The store's own page for an offer, through Shopify's public predictive search: a product whose title matches and whose
 * price equals the catalog's. Null for non-Shopify stores and for no confident match.
 */
export async function shopifyProductUrl(offer: { title: string; priceMinor: string; store: { domain: string } }, request: typeof fetch = fetch) {
  const url = new URL(`https://${offer.store.domain}/search/suggest.json`);
  url.search = new URLSearchParams({ q: offer.title, "resources[type]": "product", "resources[limit]": "5" }).toString();
  const response = await request(url, { signal: AbortSignal.timeout(4000), headers: { accept: "application/json" } }).catch(() => null);
  if (!response?.ok || !response.headers.get("content-type")?.includes("json")) return null;
  const parsed = suggestSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) return null;
  const words = (text: string) => new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  const wanted = words(offer.title);
  const match = parsed.data.resources.results.products.find(product => product.price !== undefined &&
    Math.round(Number(product.price) * 100) === Number(offer.priceMinor) &&
    [...words(product.title)].filter(word => wanted.has(word)).length >= Math.min(2, words(product.title).size));
  if (!match) return null;
  const page = new URL(match.url, response.url);
  if (!/^\/products\/[^/]+$/.test(page.pathname)) return null;
  // The store's canonical host (often www.), so checkout stays on the purchase URL's origin.
  const product = await request(`${page.origin}${page.pathname}.js`, { signal: AbortSignal.timeout(4000) }).catch(() => null);
  if (!product?.ok || !/json|javascript/.test(product.headers.get("content-type") ?? "")) return null;
  return `${new URL(product.url).origin}${page.pathname}`;
}

/** Search, then find each offer's page at Shopify stores so `purchase` can use the fast checkout. Those rank first. */
export async function searchProducts(input: ProductSearchInput, request: typeof fetch = fetch): Promise<ProductOffer[]> {
  const offers = (await searchCatalog(input, request)).filter(offer => offer.available).slice(0, input.limit * 2);
  const resolved = await Promise.all(offers.map(async offer => {
    const productUrl = await shopifyProductUrl(offer, request);
    return { ...offer, productUrl, checkout: productUrl ? "shopify" as const : "browser" as const };
  }));
  const seen = new Set<string>();
  const unique = resolved.filter(offer => {
    const key = offer.productUrl ?? `${offer.store.domain} ${offer.title} ${offer.variant ?? ""}`;
    return !seen.has(key) && !!seen.add(key);
  });
  return [...unique.filter(offer => offer.productUrl), ...unique.filter(offer => !offer.productUrl)].slice(0, input.limit);
}
