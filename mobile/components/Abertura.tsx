import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, AppState, Easing, Platform, StyleSheet, View } from "react-native";
import { ABERTURA_DESENHO_MS, ABERTURA_ESPERA_DA_LOGO_MS, ABERTURA_LIMITE_MS, ABERTURA_PAUSA_MS, ABERTURA_SAIDA_MS, criarLargada, encerrarUmaVez } from "../lib/abertura";
import { colors } from "../lib/theme";
import { Logo } from "./Logo";

const ALTURA_DA_LOGO = 64;
const LARGURA_DA_LOGO = ALTURA_DA_LOGO * (719 / 320);
const nativeDriver = Platform.OS !== "web";

export function Abertura({ onFim, onDesenhoConcluido }: { onFim: () => void; onDesenhoConcluido: () => void }) {
  const revelar = useRef(new Animated.Value(0)).current;
  const entrada = useRef(new Animated.Value(0)).current;
  const saida = useRef(new Animated.Value(0)).current;
  const logoCarregada = useRef(false);
  const avisarLogo = useRef<() => void>(() => {});
  const aoCarregarLogo = useCallback(() => {
    logoCarregada.current = true;
    avisarLogo.current();
  }, []);

  useEffect(() => {
    let cancelado = false;
    const encerrar = encerrarUmaVez(() => {
      if (!cancelado) onFim();
    });
    const limite = setTimeout(encerrar, ABERTURA_LIMITE_MS);
    const estado = AppState.addEventListener("change", (atual) => {
      if (atual !== "active") encerrar();
    });
    const desenho = Animated.parallel([
      Animated.timing(revelar, { toValue: 1, duration: ABERTURA_DESENHO_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
      Animated.timing(entrada, { toValue: 1, duration: ABERTURA_DESENHO_MS, easing: Easing.out(Easing.cubic), useNativeDriver: nativeDriver }),
    ]);
    const despedida = Animated.sequence([
      Animated.delay(ABERTURA_PAUSA_MS),
      Animated.timing(saida, { toValue: 1, duration: ABERTURA_SAIDA_MS, easing: Easing.in(Easing.cubic), useNativeDriver: nativeDriver }),
    ]);
    const largada = criarLargada((reduzir) => {
      if (cancelado) return;
      SplashScreen.hideAsync().catch(() => {});
      if (reduzir) return encerrar();
      desenho.start(({ finished }) => {
        if (cancelado) return;
        onDesenhoConcluido();
        if (!finished) return encerrar();
        despedida.start(encerrar);
      });
    });
    avisarLogo.current = largada.logoPronta;
    if (logoCarregada.current) largada.logoPronta();
    const esperaDaLogo = setTimeout(largada.logoPronta, ABERTURA_ESPERA_DA_LOGO_MS);
    AccessibilityInfo.isReduceMotionEnabled().then(largada.preferenciaLida, () => largada.preferenciaLida(true));
    return () => {
      cancelado = true;
      avisarLogo.current = () => {};
      clearTimeout(limite);
      clearTimeout(esperaDaLogo);
      estado.remove();
      desenho.stop();
      despedida.stop();
    };
  }, [revelar, entrada, saida, onFim, onDesenhoConcluido]);

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
          <Logo altura={ALTURA_DA_LOGO} aoCarregar={aoCarregarLogo}/>
        </Animated.View>
      </View>
    </Animated.View>
  </Animated.View>;
}
