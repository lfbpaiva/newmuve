function required(name: keyof ImportMetaEnv): string {
  const value = import.meta.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente ${name} não definida. Consulte o arquivo .env.example.`);
  }
  return value;
}

export const env = {
  supabaseUrl: required("VITE_SUPABASE_URL").replace(/\/+$/, ""),
  supabaseAnonKey: required("VITE_SUPABASE_ANON_KEY"),
  apiUrl: required("VITE_API_URL").replace(/\/+$/, ""),
};
