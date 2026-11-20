import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius, space, styles, type } from "../lib/theme";
import { useMe } from "../lib/useMe";
import { useUnreadNotifications } from "../lib/useUnreadNotifications";
import { Logo } from "./Logo";
import { Avatar, Icon, TituloCompacto, useReduceMotion } from "./ui";

function NotificationBell() {
  const me = useMe();
  const router = useRouter();
  const unread = useUnreadNotifications(me.id);
  const reduce = useReduceMotion();
  const pulso = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!unread || reduce) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulso, { toValue: 1, duration: 1200, easing: Easing.out(Easing.ease), useNativeDriver: Platform.OS !== "web" }),
      Animated.delay(1600),
    ]));
    pulso.setValue(0);
    loop.start();
    return () => loop.stop();
  }, [pulso, unread, reduce]);

  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={unread > 0 ? `Notificações, ${unread} não lidas` : "Notificações"}
    onPress={() => router.push("/notificacoes")}
    style={({ pressed }) => ({ width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? colors.surface2 : unread > 0 ? colors.surface : "transparent", borderWidth: 1, borderColor: unread > 0 ? colors.hairline : "transparent" })}
  >
    <Icon name={unread > 0 ? "notifications" : "notifications-outline"} size={19} color={unread > 0 ? colors.ink : colors.ink2}/>
    {unread > 0 && <>
      <Animated.View pointerEvents="none" style={{ position: "absolute", top: 3, right: 3, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.accentBright, opacity: pulso.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: pulso.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) }] }}/>
      <View style={{ position: "absolute", top: 2, right: 0, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <Text style={[type.label, { fontSize: 10, lineHeight: 12, color: colors.onAccent }]}>{unread > 9 ? "9+" : unread}</Text>
      </View>
    </>}
  </Pressable>;
}

export function TopBar({ titulo }: { titulo: string }) {
  const me = useMe();
  const router = useRouter();
  return <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
    <View style={[styles.between, { width: "100%", maxWidth: 480, alignSelf: "center", minHeight: 56, paddingHorizontal: space.lg, gap: space.md }]}>
      <View style={[styles.row, { flex: 1, gap: space.md }]}>
        <Logo/>
        <TituloCompacto titulo={titulo}/>
      </View>
      <View style={[styles.row, { gap: space.sm }]}>
        <NotificationBell/>
        <Pressable accessibilityRole="button" accessibilityLabel="Abrir meu perfil" onPress={() => router.push("/(app)/profile")} style={({ pressed }) => ({ borderRadius: radius.pill, padding: 2, borderWidth: 1, borderColor: pressed ? colors.accentBright : colors.hairline })}>
          <Avatar uri={me.fotoPerfilUrl} name={me.nome} size={32}/>
        </Pressable>
      </View>
    </View>
  </SafeAreaView>;
}
