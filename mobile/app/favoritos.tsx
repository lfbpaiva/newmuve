import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { errorMessage } from "../../shared/client/api.ts";
import { fetchFavorites, fetchMyEvents, inviteMusician, setFavorite, type Favorite } from "../../shared/client/events.ts";
import { formatEventDateTime } from "../../shared/client/format.ts";
import { useAsync } from "../../shared/client/useAsync.ts";
import { isPro } from "../../shared/dominio.ts";
import { Alert, Avatar, Button, EmptyState, ErrorState, Loading, Pill, RatingSummary, Screen, Select, Snackbar } from "../components/ui";
import { space, styles, type } from "../lib/theme";
import { useMe } from "../lib/useMe";
import { useRefreshOnFocus } from "../lib/useRefreshOnFocus";

export default function FavoritesScreen() {
  const me = useMe();
  const router = useRouter();
  const favoritos = useAsync(`favoritos:${me.id}`, () => fetchFavorites(me.id));
  const eventos = useAsync(`abertos:${me.id}`, async () => (await fetchMyEvents(me.id)).filter((e) => e.status === "ABERTO" && new Date(e.inicio) > new Date()));
  useRefreshOnFocus(favoritos.reload);
  const [error, setError] = useState("");
  const [snack, setSnack] = useState("");

  if (!isPro(me.casaAte)) return <Screen>
    <EmptyState title="Favoritos fazem parte do Muve Casa" action={<Button title="Conhecer o Muve Casa" block={false} onPress={() => router.push("/casa")}/>}>
      <Text style={[type.bodySmall, { textAlign: "center" }]}>Salve os músicos que tocaram bem e convide direto para os próximos eventos.</Text>
    </EmptyState>
  </Screen>;
  if (favoritos.error) return <Screen><ErrorState message={favoritos.error} onRetry={favoritos.reload}/></Screen>;
  if (!favoritos.data) return <Screen><Loading cards={2}/></Screen>;
  if (favoritos.data.length === 0) return <Screen>
    <EmptyState title="Nenhum favorito ainda">
      <Text style={[type.bodySmall, { textAlign: "center" }]}>Toque no coração no cartão de um candidato para salvá-lo aqui.</Text>
    </EmptyState>
  </Screen>;

  async function act(action: () => Promise<unknown>, done: string) {
    setError("");
    try {
      await action();
      setSnack(done);
      favoritos.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const opcoes = (eventos.data ?? []).map((e) => ({ value: e.id, label: `${e.titulo} · ${formatEventDateTime(e.inicio, e.uf)}` }));

  return <View style={styles.screen}>
    <Screen>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {favoritos.data.map(({ musician }: Favorite) => <View key={musician.id} style={[styles.card, { gap: space.md }]}>
        <View style={[styles.row, { gap: 12 }]}>
          <Avatar uri={musician.fotoPerfilUrl} name={musician.nome} size={52}/>
          <View style={{ flex: 1 }}>
            <View style={[styles.row, { gap: 6 }]}><Text style={type.titleSmall}>{musician.nome}</Text>{musician.pro ? <Pill text="Pro" tone="accent"/> : null}</View>
            <Text style={type.bodySmall}>{musician.cidade}, {musician.uf} · {musician.estilosMusicais.join(", ")}</Text>
            <RatingSummary media={musician.avaliacaoMedia} total={musician.totalAvaliacoes}/>
          </View>
        </View>
        {opcoes.length > 0
          ? <Select label="Convidar para" value="" placeholder="Escolher um evento aberto" options={opcoes} onChange={(eventId) => void act(() => inviteMusician(eventId, musician.id), `Convite enviado para ${musician.nome}.`)}/>
          : <Text style={type.bodySmall}>Publique um evento para poder convidar.</Text>}
        <Button title="Remover dos favoritos" variant="text" block={false} onPress={() => void act(() => setFavorite(musician.id, false), "Removido dos favoritos.")}/>
      </View>)}
    </Screen>
    {snack ? <Snackbar message={snack} onHide={() => setSnack("")}/> : null}
  </View>;
}
