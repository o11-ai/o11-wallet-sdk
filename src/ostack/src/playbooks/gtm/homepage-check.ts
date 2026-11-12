// Homepage labels for a TAM list's first pass. A cheap hint for the tam step, never a verdict.
const B2B = [/book a demo/, /request a demo/, /schedule a demo/, /get a demo/, /talk to sales/, /contact sales/, /\bfor teams\b/,
  /\bfor businesses\b/, /\benterprise\b/, /\bb2b\b/, /\bsaas\b/, /\bapi\b/, /\bsdk\b/, /\bdevelopers?\b/, /\bworkflows?\b/,
  /\bintegrations?\b/, /\bsoc ?2\b/, /\byour (team|business|company|customers|clients)\b/, /\bplatform\b/, /\bfree trial\b/,
  /\bpricing\b/, /\bai agents?\b/, /\bautomat/];
const CONSUMER = [/add to cart/, /\bshop now\b/, /app store/, /google play/, /\bfree shipping\b/, /\bcheckout\b/, /subscribe & save/,
  /\bgamers?\b/, /\bdating\b/, /\bfashion\b/, /\brecipes?\b/, /\bmy family\b/];
const SERVICES = [/\bagency\b/, /\bconsult(ing|ancy|ants?)\b/, /\bweb design\b/, /\bstaff augmentation\b/, /\boutsourc/,
  /\bdevelopment services\b/, /\bfreelanc/, /\bfractional\b/, /\bmanaged services?\b/, /\b(web|software|design|dev) studio\b/];
const PARKED = [/domain (is )?for sale/, /buy this domain/, /\bparked\b/, /hugedomains/, /\bsedo\b/, /site not found/, /coming soon/];

/** Free mailbox providers: a registry email on one of these says nothing about the company's website. */
const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "rocketmail.com", "hotmail.com", "outlook.com", "live.com",
  "msn.com", "aol.com", "icloud.com", "me.com", "mac.com", "proton.me", "protonmail.com", "gmx.com", "mail.com", "zoho.com", "att.net",
  "sbcglobal.net", "bellsouth.net", "comcast.net", "verizon.net", "cox.net", "charter.net", "earthlink.net", "windstream.net", "frontier.com",
  "centurylink.net", "juno.com", "netzero.net"]);

/** A domain worth fetching, or null when the row has none (blank, malformed, or a free mailbox provider). */
export function websiteDomain(value: string | undefined): string | null {
  const domain = (value ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) && !FREE_MAIL.has(domain) ? domain : null;
}

const decode = (text: string) =>
  text.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&[nm]dash;/g, "-");

/** The homepage HTML, trying HTTPS twice and then HTTP. An empty string means nothing usable came back. */
export async function fetchHome(domain: string): Promise<string> {
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return "";
  for (const url of [`https://${domain}`, `https://${domain}`, `http://${domain}`]) {
    try {
      const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(12_000), headers: { "user-agent": "Mozilla/5.0 (compatible; ostack-tam)" } });
      const html = (await response.text()).slice(0, 4_000_000);
      if (html.length >= 300) return html;
    } catch {
      // Try the next attempt.
    }
  }
  return "";
}

export function label(html: string): { check: string; title: string; signals: string } {
  if (html.length < 300) return { check: "dead", title: "", signals: "" };
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim());
  const meta = decode(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)?.[1] ?? "");
  const body = decode(html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").toLowerCase();
  const head = `${title} | ${meta}`.replace(/\s+/g, " ").slice(0, 160);
  const text = `${head.toLowerCase()} ${meta.toLowerCase()} ${body}`;
  if (body.length < 1500 && PARKED.some((pattern) => pattern.test(text))) return { check: "parked", title: head, signals: "" };
  const b2b = B2B.filter((pattern) => pattern.test(text)).length;
  const consumer = CONSUMER.filter((pattern) => pattern.test(text)).length;
  const services = SERVICES.filter((pattern) => pattern.test(text)).length;
  const check = b2b >= 3 && consumer <= 1 && services <= 1 ? "b2b"
    : consumer >= 3 && b2b <= 2 ? "consumer"
    : services >= 2 && b2b <= 3 ? "services" : "unsure";
  return { check, title: head, signals: `b2b:${b2b} consumer:${consumer} services:${services}` };
}
