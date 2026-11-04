import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { signInWithGoogle } from "../lib/authLinks";
import { colors, space, type } from "../lib/theme";
import { Button } from "./ui";

export function GoogleButton({ onError }: { onError: (message: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [ativo, setAtivo] = useState(false);

  useEffect(() => {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const apikey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !apikey) return;
    fetch(`${url}/auth/v1/settings`, { headers: { apikey } })
      .then((response) => response.json())
      .then((settings: { external?: { google?: boolean } }) => setAtivo(settings.external?.google === true))
      .catch(() => setAtivo(false));
  }, []);

  async function entrar() {
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Não foi possível entrar com o Google.");
    } finally {
      setLoading(false);
    }
  }

  if (!ativo) return null;

  return <View style={{ gap: space.md }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.line }}/>
      <Text style={type.labelSmall}>ou</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.line }}/>
    </View>
    <Button title="Continuar com Google" variant="outlined" icon="logo-google" loading={loading} onPress={() => void entrar()}/>
  </View>;
}
