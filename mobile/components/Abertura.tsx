import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from "react-native";
import { colors } from "../lib/theme";
import { Logo } from "./Logo";

const ALTURA_DA_LOGO = 64;
const LARGURA_DA_LOGO = ALTURA_DA_LOGO * (719 / 320);
const nativeDriver = Platform.OS !== "web";

export function Abertura({ onFim }: { onFim: () => void }) {
  const escrita = useRef(new Animated.Value(0)).current;
  const revelar = useRef(new Animated.Value(0)).current;
  const brilho = useRef(new Animated.Value(0)).current;
  const saida = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelado = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduzir) => {
      if (cancelado) return;
      if (reduzir) return onFim();
      Animated.sequence([
        Animated.parallel([
          Animated.timing(escrita, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.cubic), useNativeDriver: nativeDriver }),
          Animated.timing(revelar, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
          Animated.timing(brilho, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: nativeDriver }),
        ]),
        Animated.delay(220),
        Animated.timing(saida, { toValue: 1, duration: 420, easing: Easing.in(Easing.cubic), useNativeDriver: nativeDriver }),
      ]).start(({ finished }) => finished && onFim());
    }, onFim);
    return () => {
      cancelado = true;
    };
  }, [escrita, revelar, brilho, saida, onFim]);

  return <Animated.View
    pointerEvents="none"
    accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
    style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", opacity: saida.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
  >
    <Animated.View style={{ position: "absolute", width: 420, height: 420, opacity: brilho.interpolate({ inputRange: [0, 1], outputRange: [0, 0.9] }), transform: [{ scale: brilho.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
      <LinearGradient colors={["rgba(124,77,225,0)", "rgba(124,77,225,0.28)", "rgba(124,77,225,0)"]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ flex: 1, borderRadius: 210 }}/>
    </Animated.View>
    <Animated.View style={{ transform: [{ scale: saida.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }, { translateY: escrita.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }}>
      <View style={{ width: LARGURA_DA_LOGO, height: ALTURA_DA_LOGO }}>
        <Animated.View style={{ height: ALTURA_DA_LOGO, overflow: "hidden", width: revelar.interpolate({ inputRange: [0, 1], outputRange: [0, LARGURA_DA_LOGO] }) }}>
          <Logo altura={ALTURA_DA_LOGO}/>
        </Animated.View>
      </View>
    </Animated.View>
  </Animated.View>;
}
