/** One provider represents one grant and resource. Do not share it across accounts. */
export interface AccessTokenProvider {
  getAccessToken(): Promise<string>;
  refreshAccessToken?(rejectedToken: string): Promise<string>;
}

/** Serializes refresh for clients (including withCard copies) sharing one provider. */
export function serializedTokenProvider(provider: AccessTokenProvider): AccessTokenProvider {
  let pending: Promise<string> | undefined;
  let latest: string | undefined;
  const retired = new Set<string>();
  const get = async () => {
    const loaded = await provider.getAccessToken();
    return retired.has(loaded) && latest ? latest : loaded;
  };
  return {
    getAccessToken: get,
    ...(provider.refreshAccessToken ? { refreshAccessToken(rejectedToken: string) {
      if (retired.has(rejectedToken) && latest) return Promise.resolve(latest);
      if (!pending) pending = (async () => {
        const current = await get();
        if (current !== rejectedToken) return current;
        const token = await provider.refreshAccessToken!(rejectedToken);
        retired.add(rejectedToken); latest = token;
        return token;
      })().finally(() => { pending = undefined; });
      return pending;
    } } : {}),
  };
}
