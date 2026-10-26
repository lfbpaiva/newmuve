import { useState } from "react";
import { Text, View } from "react-native";
import { signInWithGoogle } from "../lib/authLinks";
import { colors, space, type } from "../lib/theme";
import { Button } from "./ui";

export function GoogleButton({ onError }: { onError: (message: string) => void }) {
  const [loading, setLoading] = useState(false);

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

  return <View style={{ gap: space.md }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.line }}/>
      <Text style={type.labelSmall}>ou</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.line }}/>
    </View>
    <Button title="Continuar com Google" variant="outlined" icon="logo-google" loading={loading} onPress={() => void entrar()}/>
  </View>;
}
