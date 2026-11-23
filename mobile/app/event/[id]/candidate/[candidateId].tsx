import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { fetchCandidateProfile, type CandidateStatus } from "../../../../../shared/client/events.ts";
import { useAsync } from "../../../../../shared/client/useAsync.ts";
import { isPro, isValidUrl } from "../../../../../shared/dominio.ts";
import { LinksDoTrabalho, ReviewsSection } from "../../../../components/events";
import { Alert, Avatar, Button, EmptyState, ErrorState, Loading, Pill, RatingSummary, Screen, Surface, Section, Tag } from "../../../../components/ui";
import { useFavoritos } from "../../../../lib/useFavoritos";
import { space, styles, type } from "../../../../lib/theme";
import { denunciar } from "../../../../lib/suporte";
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
  const favoritos = useFavoritos(me.id, casa);
  const [error, setError] = useState("");

  if (profile.error) return <Screen><ErrorState message={profile.error} onRetry={profile.reload}/></Screen>;
  if (profile.loading && !profile.data) return <Screen><Loading cards={1}/></Screen>;
  if (!profile.data) return <Screen>
    <EmptyState title="Perfil indisponível"><Text style={type.bodySmall}>A candidatura ou o perfil deste músico não está mais disponível para este evento.</Text></EmptyState>
  </Screen>;

  const { status, musician } = profile.data;
  const pill = statusPill[status];
  const favoritar = (favorito: boolean) => {
    setError("");
    void favoritos.alternar(musician.id, favorito);
  };
  const botaoFavorito = favoritos.botao(musician.id);
  return <Screen>
    <Surface destaque>
      <View style={[styles.row, { gap: space.lg }]}>
        <View style={{ borderRadius: 999, padding: 3, borderWidth: 1, borderColor: "rgba(139,107,255,0.5)" }}><Avatar uri={musician.fotoPerfilUrl} name={musician.nome} size={80}/></View>
        <View style={{ flex: 1, gap: space.sm }}>
          <View style={[styles.row, { gap: 6, flexWrap: "wrap" }]}><Pill text={pill.text} tone={pill.tone}/>{musician.pro ? <Pill text="Pro" tone="accent"/> : null}</View>
          <Text style={type.headline} accessibilityRole="header">{musician.nome}</Text>
          <Text style={type.bodySmall}>{musician.cidade && musician.uf ? `${musician.cidade}, ${musician.uf}` : "Cidade não informada"}</Text>
          <RatingSummary media={musician.avaliacaoMedia} total={musician.totalAvaliacoes}/>
        </View>
      </View>
      {botaoFavorito.visivel && (botaoFavorito.favorito
        ? <Button title="Nos favoritos" variant="tonal" icon="heart" pendente={botaoFavorito.salvando} onPress={() => favoritar(false)}/>
        : <Button title="Salvar nos favoritos" variant="outlined" icon="heart-outline" pendente={botaoFavorito.salvando} onPress={() => favoritar(true)}/>)}
    </Surface>
    {error || favoritos.erro ? <Alert tone="error">{error || favoritos.erro}</Alert> : null}
    {!error && favoritos.erro && favoritos.podeTentarDeNovo ? <Button title="Tentar novamente" variant="text" icon="refresh" block={false} onPress={favoritos.tentarDeNovo}/> : null}
    <Button title={`Denunciar ${musician.nome}`} variant="text" icon="flag-outline" onPress={() => { setError(""); denunciar(musician.nome, "perfil de candidato", me.email, setError); }}/>
    <Section title="Apresentação">
      <Text style={musician.bio ? type.body : type.bodySmall}>{musician.bio || "Descrição não informada."}</Text>
      {musician.estilosMusicais.length > 0 && <View style={[styles.row, { flexWrap: "wrap" }]}>{musician.estilosMusicais.map((estilo) => <Tag key={estilo} text={estilo}/>)}</View>}
      <LinksDoTrabalho portfolioUrl={musician.portfolioUrl && isValidUrl(musician.portfolioUrl) ? musician.portfolioUrl : null} redesSociais={musician.redesSociais} onErro={setError}/>
    </Section>
    <ReviewsSection userId={musician.id} empty="Nenhuma avaliação recebida."/>
  </Screen>;
}
