import { LinearGradient } from "expo-linear-gradient";
import { Text, View } from "react-native";
import { colors, gradients, space, type } from "../lib/theme";
import { Logo } from "./Logo";
import { Reveal } from "./ui";

export function AuthHeader({ titulo, destaque, subtitulo, grande = false }: { titulo: string; destaque?: string; subtitulo?: string; grande?: boolean }) {
  return <View style={{ gap: space.lg, paddingTop: grande ? space.xxl : space.sm }}>
    <LinearGradient pointerEvents="none" colors={gradients.brilho} style={{ position: "absolute", left: -space.xl, right: -space.xl, top: -space.xxl, height: grande ? 360 : 240 }}/>
    <Reveal><Logo altura={grande ? 44 : 32}/></Reveal>
    <Reveal index={1}><View style={{ gap: space.sm }}>
      <Text style={[type.display, grande ? { fontSize: 36, lineHeight: 40 } : { fontSize: 28, lineHeight: 33 }]} accessibilityRole="header">
        {titulo}{destaque ? <Text style={{ color: colors.accentText }}> {destaque}</Text> : null}
      </Text>
      {subtitulo ? <Text style={[type.body, { color: colors.ink2 }]}>{subtitulo}</Text> : null}
    </View></Reveal>
  </View>;
}
