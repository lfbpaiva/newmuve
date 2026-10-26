import { useRouter, type Href } from "expo-router";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { formatDateTime } from "../../shared/client/format.ts";
import { fetchNotifications, markNotificationsRead, type AppNotification } from "../../shared/client/notifications.ts";
import { useAsync } from "../../shared/client/useAsync.ts";
import { EmptyState, ErrorState, Icon, Loading, Screen } from "../components/ui";
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
    <EmptyState title="Nada por aqui ainda"><Text style={[type.bodySmall, { textAlign: "center" }]}>Inscrições, mensagens, contratações e repasses aparecem aqui.</Text></EmptyState>
  </Screen>;

  return <Screen>
    <View style={{ gap: space.sm }}>
      {notifications.data.map((notification) => <NotificationItem key={notification.id} notification={notification}/>)}
    </View>
  </Screen>;
}

function NotificationItem({ notification }: { notification: AppNotification }) {
  const router = useRouter();
  const { link } = notification;
  return <Pressable
    accessibilityRole={link ? "button" : "text"}
    disabled={!link}
    onPress={() => link && router.push(link as Href)}
    style={({ pressed }) => [styles.card, { flexDirection: "row", gap: space.md, borderRadius: radius.md, backgroundColor: pressed ? colors.surface2 : colors.surface, borderLeftWidth: 3, borderLeftColor: notification.lida ? "transparent" : colors.accent }]}
  >
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={type.titleSmall}>{notification.titulo}</Text>
      <Text style={type.bodySmall}>{notification.texto}</Text>
      <Text style={[type.labelSmall, { marginTop: 4 }]}>{formatDateTime(notification.createdAt)}</Text>
    </View>
    {link ? <Icon name="chevron-forward" size={18} color={colors.ink3}/> : null}
  </Pressable>;
}
