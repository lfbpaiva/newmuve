import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts, motion, radius, space } from "../lib/theme";
import { Icon, type IconName } from "./ui";

interface Rota {
  key: string;
  name: string;
}

interface PropsDaBarra {
  state: { index: number; routes: Rota[] };
  descriptors: Record<string, { options: { title?: string; tabBarBadge?: string | number } }>;
  navigateToTab(routeKey: string): void;
}

const iconesDasAbas: Record<string, IconName> = {
  index: "home-outline",
  events: "calendar-outline",
  profile: "person-outline",
  settings: "settings-outline",
};

const LARGURA_DA_PILULA = 56;

export function BarraDeAbas({ state, descriptors, navigateToTab }: PropsDaBarra) {
  const { bottom } = useSafeAreaInsets();
  const [largura, setLargura] = useState(0);
  const posicao = useRef(new Animated.Value(state.index)).current;
  const larguraDaAba = largura / state.routes.length;
  const ultima = Math.max(state.routes.length - 1, 1);

  useEffect(() => {
    Animated.timing(posicao, { toValue: state.index, duration: motion.base, easing: Easing.out(Easing.exp), useNativeDriver: Platform.OS !== "web" }).start();
  }, [posicao, state.index]);

  return <View
    accessibilityRole="tablist"
    onLayout={(event) => setLargura(event.nativeEvent.layout.width)}
    style={{ flexDirection: "row", backgroundColor: "rgba(12,12,17,0.98)", borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: space.sm, paddingBottom: Math.max(bottom, space.sm) }}
  >
    {largura > 0 && <Animated.View pointerEvents="none" style={{
      position: "absolute",
      top: space.sm,
      left: (larguraDaAba - LARGURA_DA_PILULA) / 2,
      width: LARGURA_DA_PILULA,
      height: 32,
      borderRadius: radius.pill,
      backgroundColor: colors.accentSoft,
      transform: [{ translateX: posicao.interpolate({ inputRange: [0, ultima], outputRange: [0, larguraDaAba * ultima] }) }],
    }}/>}
    {state.routes.map((rota, index) => {
      const ativa = state.index === index;
      const titulo = descriptors[rota.key]?.options.title ?? rota.name;
      const selo = descriptors[rota.key]?.options.tabBarBadge;
      return <Pressable
        key={rota.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: ativa }}
        accessibilityLabel={titulo}
        onPress={() => {
          if (!ativa) navigateToTab(rota.key);
        }}
        style={{ flex: 1, alignItems: "center", gap: 4, minHeight: 52 }}
      >
        <View style={{ height: 32, justifyContent: "center" }}>
          <Icon name={iconesDasAbas[rota.name] ?? "ellipse-outline"} size={21} color={ativa ? colors.accentText : colors.ink3}/>
          {selo ? <View style={{ position: "absolute", top: 4, right: -4, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accentBright, borderWidth: 2, borderColor: colors.bg }}/> : null}
        </View>
        <Text style={{ fontFamily: ativa ? fonts.semibold : fonts.medium, fontSize: 11, lineHeight: 14, color: ativa ? colors.ink : colors.ink3 }}>{titulo}</Text>
      </Pressable>;
    })}
  </View>;
}
