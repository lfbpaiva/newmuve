import { router } from "expo-router";
import { Platform, Pressable } from "react-native";
import { colors } from "../lib/theme";
import { Icon } from "./ui";

function BotaoVoltar({ canGoBack }: { canGoBack?: boolean }) {
  if (!canGoBack) return null;
  return <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Voltar" hitSlop={4} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -8 }}>
    <Icon name="chevron-back" size={24} color={colors.ink}/>
  </Pressable>;
}

export const voltarNaWeb = Platform.OS === "web" ? { headerLeft: ({ canGoBack }: { canGoBack?: boolean }) => <BotaoVoltar canGoBack={canGoBack}/> } : {};
