import { useLocalSearchParams } from "expo-router";
import { Linking, Text, View } from "react-native";
import { fetchCandidateProfile, fetchFavoriteIds, setFavorite, type CandidateStatus } from "../../../../../shared/client/events.ts";
import { useAsync } from "../../../../../shared/client/useAsync.ts";
import { isPro, isValidUrl } from "../../../../../shared/dominio.ts";
import { ReviewsSection } from "../../../../components/events";
import { Avatar, Button, EmptyState, ErrorState, Loading, Pill, RatingSummary, Screen, Section, Tag } from "../../../../components/ui";
import { space, styles, type } from "../../../../lib/theme";
import { useMe } from "../../../../lib/useMe";

const statusPill: Record<CandidateStatus, { text: string; tone: "accent" | "success" | "muted" }> = {
  PENDENTE: { text: "Candidatura pendente", tone: "accent" },
  APROVADO: { text: "Contratado", tone: "success" },
  RECUSADO: { text: "Não selecionado", tone: "muted" },
};

export default function CandidateProfileScreen() {
  const { id: eventId, candidateId } = useLocalSearchParams<{ id: string; candidateId: string }>();
  const profile = useAsync(`candidate-profile:${eventId}:${candidateId}`, () => fetchCandidateProfile(eventId, candidateId));
  const me = useMe();
  const casa = isPro(me.casaAte);
  const favoritos = useAsync(`favoritos-ids:${me.id}`, () => (casa ? fetchFavoriteIds(me.id) : Promise.resolve([])));

  if (profile.error) return <Screen><ErrorState message={profile.error} onRetry={profile.reload}/></Screen>;
  if (profile.loading && !profile.data) return <Screen><Loading cards={1}/></Screen>;
  if (!profile.data) return <Screen>
    <EmptyState title="Perfil indisponível"><Text style={type.bodySmall}>A candidatura ou o perfil deste músico não está mais disponível para este evento.</Text></EmptyState>
  </Screen>;

  const { status, musician } = profile.data;
  const pill = statusPill[status];
  return <Screen>
    <View style={{ gap: space.lg }}>
      <View style={styles.rule}/>
      <View style={[styles.row, { gap: space.lg }]}>
        <Avatar uri={musician.fotoPerfilUrl} name={musician.nome} size={88}/>
        <View style={{ flex: 1, gap: space.sm }}>
          <View style={[styles.row, { gap: 6, flexWrap: "wrap" }]}><Pill text={pill.text} tone={pill.tone}/>{musician.pro ? <Pill text="Pro" tone="accent"/> : null}</View>
          <Text style={type.headline} accessibilityRole="header">{musician.nome}</Text>
          <Text style={type.bodySmall}>{musician.cidade && musician.uf ? `${musician.cidade}, ${musician.uf}` : "Cidade não informada"}</Text>
          <RatingSummary media={musician.avaliacaoMedia} total={musician.totalAvaliacoes}/>
        </View>
      </View>
      {casa && favoritos.data && (favoritos.data.includes(musician.id)
        ? <Button title="Nos favoritos" variant="tonal" icon="heart" onPress={() => void setFavorite(musician.id, false).then(favoritos.reload)}/>
        : <Button title="Salvar nos favoritos" variant="outlined" icon="heart-outline" onPress={() => void setFavorite(musician.id, true).then(favoritos.reload)}/>)}
    </View>
    <Section title="Apresentação">
      <Text style={musician.bio ? type.body : type.bodySmall}>{musician.bio || "Descrição não informada."}</Text>
      {musician.estilosMusicais.length > 0 && <View style={[styles.row, { flexWrap: "wrap" }]}>{musician.estilosMusicais.map((estilo) => <Tag key={estilo} text={estilo}/>)}</View>}
      {musician.portfolioUrl && isValidUrl(musician.portfolioUrl) ? <Button title="Ver trabalho do músico" variant="outlined" icon="play-circle-outline" onPress={() => Linking.openURL(musician.portfolioUrl!)}/> : null}
    </Section>
    <ReviewsSection userId={musician.id} empty="Nenhuma avaliação recebida."/>
  </Screen>;
}
