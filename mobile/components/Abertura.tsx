import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from "react-native";
import { colors } from "../lib/theme";
import { Logo } from "./Logo";

const ALTURA_DA_LOGO = 64;
const LARGURA_DA_LOGO = ALTURA_DA_LOGO * (719 / 320);
const nativeDriver = Platform.OS !== "web";

export function Abertura({ onFim }: { onFim: () => void }) {
  const revelar = useRef(new Animated.Value(0)).current;
  const entrada = useRef(new Animated.Value(0)).current;
  const saida = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelado = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduzir) => {
      if (cancelado) return;
      if (reduzir) return onFim();
      Animated.sequence([
        Animated.parallel([
          Animated.timing(revelar, { toValue: 1, duration: 950, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
          Animated.timing(entrada, { toValue: 1, duration: 950, easing: Easing.out(Easing.cubic), useNativeDriver: nativeDriver }),
        ]),
        Animated.delay(260),
        Animated.timing(saida, { toValue: 1, duration: 520, easing: Easing.in(Easing.cubic), useNativeDriver: nativeDriver }),
      ]).start(({ finished }) => finished && onFim());
    }, onFim);
    return () => {
      cancelado = true;
    };
  }, [revelar, entrada, saida, onFim]);

  return <Animated.View
    pointerEvents="none"
    accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
    style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", opacity: saida.interpolate({ inputRange: [0, 0.4, 1], outputRange: [1, 1, 0] }) }]}
  >
    <Animated.View style={{
      opacity: saida.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
      transform: [
        { translateY: entrada.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
        { scale: Animated.multiply(entrada.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }), saida.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] })) },
      ],
    }}>
      <View style={{ width: LARGURA_DA_LOGO, height: ALTURA_DA_LOGO }}>
        <Animated.View style={{ height: ALTURA_DA_LOGO, overflow: "hidden", width: revelar.interpolate({ inputRange: [0, 1], outputRange: [0, LARGURA_DA_LOGO] }) }}>
          <Logo altura={ALTURA_DA_LOGO}/>
        </Animated.View>
      </View>
    </Animated.View>
  </Animated.View>;
}
