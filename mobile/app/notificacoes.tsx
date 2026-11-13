import { useRouter, type Href } from "expo-router";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { formatDateTime } from "../../shared/client/format.ts";
import { fetchNotifications, markNotificationsRead, type AppNotification } from "../../shared/client/notifications.ts";
import { useAsync } from "../../shared/client/useAsync.ts";
import { EmptyState, ErrorState, Icon, Loading, Reveal, Screen, type IconName } from "../components/ui";
import { colors, radius, space, styles, type } from "../lib/theme";
import { useMe } from "../lib/useMe";

export default function NotificationsScreen() {
  const me = useMe();
  const notifications = useAsync(`notificacoes:${me.id}`, fetchNotifications);

  useEffect(() => {
    if (notifications.data?.some((n) => !n.lida)) void markNotificationsRead().catch(() => {});
  }, [notifications.data]);

  if (notifications.error) return <Screen><ErrorState message={notifications.error} onRetry={notifications.reload}/></Screen>;
  if (!notifications.data) return <Screen><Loading cards={3}/></Screen>;
  if (notifications.data.length === 0) return <Screen>
    <EmptyState title="Nada por aqui ainda" icon="notifications-outline"><Text style={[type.bodySmall, { textAlign: "center" }]}>Inscrições, mensagens, contratações e repasses aparecem aqui.</Text></EmptyState>
  </Screen>;

  return <Screen onRefresh={notifications.reload}>
    <View style={{ gap: space.sm }}>
      {notifications.data.map((notification, index) => <NotificationItem key={notification.id} notification={notification} index={index}/>)}
    </View>
  </Screen>;
}

function iconeDaNotificacao(link: string | null): IconName {
  if (!link) return "notifications-outline";
  if (link.includes("conversa")) return "chatbubbles-outline";
  if (link.includes("hiring")) return "document-text-outline";
  if (link.includes("event")) return "calendar-outline";
  return "notifications-outline";
}

function NotificationItem({ notification, index }: { notification: AppNotification; index: number }) {
  const router = useRouter();
  const { link } = notification;
  const nova = !notification.lida;
  return <Reveal index={index}><Pressable
    accessibilityRole={link ? "button" : "text"}
    accessibilityLabel={`${nova ? "Nova: " : ""}${notification.titulo}. ${notification.texto}`}
    disabled={!link}
    onPress={() => link && router.push(link as Href)}
    style={({ pressed }) => [styles.card, { flexDirection: "row", gap: space.md, backgroundColor: pressed ? colors.surface2 : nova ? "rgba(139,107,255,0.07)" : colors.surface, borderColor: nova ? "rgba(139,107,255,0.3)" : colors.hairline }]}
  >
    <View style={{ width: 38, height: 38, borderRadius: radius.md, backgroundColor: nova ? colors.accentSoft : colors.surface2, alignItems: "center", justifyContent: "center" }}>
      <Icon name={iconeDaNotificacao(link)} size={18} color={nova ? colors.accentText : colors.ink2}/>
    </View>
    <View style={{ flex: 1, gap: 2 }}>
      <View style={[styles.row, { gap: space.sm }]}>
        <Text style={[type.titleSmall, { flex: 1 }]}>{notification.titulo}</Text>
        {nova ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accentBright }}/> : null}
      </View>
      <Text style={type.bodySmall}>{notification.texto}</Text>
      <Text style={[type.bodySmall, { fontSize: 12, color: colors.ink3, marginTop: 2 }]}>{formatDateTime(notification.createdAt)}</Text>
    </View>
  </Pressable></Reveal>;
}
