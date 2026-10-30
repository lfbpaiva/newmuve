function required(name: keyof ImportMetaEnv): string {
  const value = import.meta.env[name]?.trim();
  if (!value) throw new Error("Variável de ambiente " + name + " não definida. Consulte .env.example.");
  return value;
}

function apiBaseUrl(value: string): string {
  const base = value.replace(/\/+$/, "");
  if (base === "/api") return base;
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new Error("VITE_API_URL deve ser /api ou uma URL absoluta terminada em /api.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      url.pathname !== "/api" || url.search || url.hash ||
      (import.meta.env.PROD && url.protocol !== "https:")) {
    throw new Error("VITE_API_URL inválida: use HTTPS para a API hospedada.");
  }
  return base;
}

export const env = {
  supabaseUrl: required("VITE_SUPABASE_URL").replace(/\/+$/, ""),
  supabaseAnonKey: required("VITE_SUPABASE_ANON_KEY"),
  apiUrl: apiBaseUrl(required("VITE_API_URL")),
};
