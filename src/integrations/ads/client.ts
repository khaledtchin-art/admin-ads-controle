// Client de la plateforme ADS principale (https://ads-site-niger.lovable.app).
// Toute la console admin lit et écrit dans CETTE instance.
import { createClient } from "@supabase/supabase-js";


export const ADS_SUPABASE_URL =
  (import.meta.env["VITE_ADS_SUPABASE_URL"] as string | undefined) ??
  "https://xwzzkcwumybwnoesdmgj.supabase.co";

export const ADS_SUPABASE_PUBLISHABLE_KEY =
  (import.meta.env["VITE_ADS_SUPABASE_PUBLISHABLE_KEY"] as string | undefined) ??
  "sb_publishable_Vgs9mnLXjEZ4UBtZ8Zvumw_EgP4C25x";

// Les nouvelles clés Supabase sont opaques : elles ne doivent pas partir en Bearer.
function adsFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    if (headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

function createAdsClient() {
  return createClient(ADS_SUPABASE_URL, ADS_SUPABASE_PUBLISHABLE_KEY, {
    global: { fetch: adsFetch(ADS_SUPABASE_PUBLISHABLE_KEY) },
    auth: {
      storage: typeof window !== "undefined" ? localStorage : undefined,
      storageKey: "ads-admin-auth",
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _client: ReturnType<typeof createAdsClient> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createAdsClient>, {
  get(_t, prop, receiver) {
    if (!_client) _client = createAdsClient();
    return Reflect.get(_client, prop, receiver);
  },
});
