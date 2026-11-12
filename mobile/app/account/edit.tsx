import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { updateProfile } from "../../../shared/client/account.ts";
import { errorMessage } from "../../../shared/client/api.ts";
import { useAuth } from "../../../shared/client/AuthContext.tsx";
import type { UploadFile } from "../../../shared/client/config.ts";
import { maskDocumento, maskPhone } from "../../../shared/client/validators.ts";
import { camposFaltantes, descreverFaltantes, ESTILOS_MUSICAIS, isValidChavePix, isValidDocumento, isValidTelefone, isValidUrl, type AcaoPerfil, type CampoPerfil } from "../../../shared/dominio.ts";
import { ImageField, LocationFields, PixKeyFields } from "../../components/fields";
import { Alert, Button, Chips, Field, Grupo, Icon, Screen, Surface } from "../../components/ui";
import { colors, radius, space, styles, type } from "../../lib/theme";
import { useMe } from "../../lib/useMe";

const motivo: Record<AcaoPerfil, string> = {
  feed: "montar seu feed",
  candidatar: "se inscrever em eventos",
  criarEvento: "publicar um evento",
  pagar: "aprovar um candidato",
};

export default function EditProfileScreen() {
  const me = useMe();
  const { refreshMe } = useAuth();
  const router = useRouter();
  const { acao } = useLocalSearchParams<{ acao?: AcaoPerfil }>();
  const isMusician = me.role === "MUSICIAN";
  const faltando = acao ? camposFaltantes(me, acao) : [];
  const pede = (campo: CampoPerfil) => !acao || faltando.includes(campo);

  const [form, setForm] = useState({ nome: me.nome, documento: maskDocumento(me.documento ?? ""), telefone: maskPhone(me.telefone ?? ""), uf: me.uf ?? "", cidade: me.cidade ?? "", bio: me.bio ?? "", chavePixTipo: me.chavePixTipo ?? "", chavePix: me.chavePix ?? "", portfolioUrl: me.portfolioUrl ?? "" });
  const [estilos, setEstilos] = useState<string[]>(me.estilosMusicais ?? []);
  const [avatar, setAvatar] = useState<UploadFile | null>(null);
  const [preview, setPreview] = useState(me.fotoPerfilUrl ?? "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const set = (changes: Partial<typeof form>) => { setForm((c) => ({ ...c, ...changes })); setError(""); };

  async function save() {
    if (!form.nome.trim()) return setError("Informe seu nome.");
    if (form.documento && !isValidDocumento(form.documento)) return setError("Informe um CPF ou CNPJ válido.");
    if (form.telefone && !isValidTelefone(form.telefone)) return setError("Informe um telefone completo.");
    if (form.uf && !form.cidade) return setError("Selecione a cidade.");
    if (isMusician && form.chavePix && !isValidChavePix(form.chavePixTipo, form.chavePix)) return setError("Chave Pix inválida para o tipo selecionado.");
    if (isMusician && form.portfolioUrl && !isValidUrl(form.portfolioUrl)) return setError("Informe um link válido, começando com http:// ou https://.");
    setSubmitting(true);
    try {
      const { bio, chavePixTipo, chavePix, portfolioUrl, ...comum } = form;
      await updateProfile(isMusician ? { ...comum, bio, estilosMusicais: estilos, chavePixTipo, chavePix, portfolioUrl } : comum, avatar);
      await refreshMe();
      router.back();
    } catch (e) {
      setError(errorMessage(e));
      setSubmitting(false);
    }
  }

  return <Screen>
    {acao
      ? <Surface destaque>
        <View style={[styles.row, { gap: space.sm }]}>
          <View style={{ width: 32, height: 32, borderRadius: radius.sm, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}><Icon name="checkmark-circle-outline" size={17} color={colors.accentText}/></View>
          <Text style={type.title} accessibilityRole="header">Complete seu perfil</Text>
        </View>
        <Text style={type.bodySmall}>Para {motivo[acao]}, falta: {descreverFaltantes(faltando) || "nada; pode salvar"}.</Text>
      </Surface>
      : null}
    {pede("foto") && <ImageField label={me.fotoPerfilUrl ? "Trocar foto do perfil" : "Foto do perfil"} preview={preview} onPick={(file, uri) => { setAvatar(file); setPreview(uri); setError(""); }} onError={setError}/>}
    <Grupo titulo="Seus dados" icone="person-outline">
      {!acao && <Field label={isMusician ? "Nome ou nome da banda" : "Nome ou nome fantasia"} value={form.nome} onChangeText={(nome) => set({ nome })}/>}
      {pede("documento") && <Field label="CPF ou CNPJ" value={form.documento} onChangeText={(v) => set({ documento: maskDocumento(v) })} keyboardType="numeric" placeholder="000.000.000-00" hint={acao ? "Identifica a conta; nunca aparece para outros usuários." : undefined}/>}
      {pede("telefone") && <Field label="Telefone" value={form.telefone} onChangeText={(v) => set({ telefone: maskPhone(v) })} keyboardType="phone-pad" placeholder="(00) 00000-0000" hint={acao ? "Compartilhado com a outra parte só após uma contratação." : undefined}/>}
      {pede("cidade") && <LocationFields uf={form.uf} cidade={form.cidade} onUfChange={(uf) => set({ uf, cidade: "" })} onCidadeChange={(cidade) => set({ cidade })} onError={setError}/>}
    </Grupo>
    {isMusician && (pede("estilos") || !acao) && <Grupo titulo="Como você toca" icone="musical-notes-outline">
      <Text style={type.bodySmall}>O feed só mostra eventos destes estilos. Escolha quantos quiser.</Text>
      <Chips options={ESTILOS_MUSICAIS} selected={estilos} onToggle={(s) => { setEstilos((old) => old.includes(s) ? old.filter((x) => x !== s) : [...old, s]); setError(""); }}/>
      {!acao && <Field label="Link do seu trabalho (opcional)" hint="YouTube, Instagram, Spotify... é o que o contratante vê antes de escolher." value={form.portfolioUrl} onChangeText={(portfolioUrl) => set({ portfolioUrl })} autoCapitalize="none" keyboardType="url" placeholder="https://"/>}
      {!acao && <Field label="Bio (opcional)" value={form.bio} onChangeText={(bio) => set({ bio })} multiline maxLength={1000} placeholder="Conte um pouco sobre sua trajetória musical..."/>}
    </Grupo>}
    {isMusician && pede("chavePix") && <Grupo titulo="Recebimento" icone="cash-outline">
      <PixKeyFields tipo={form.chavePixTipo} chave={form.chavePix} onTipoChange={(chavePixTipo) => set({ chavePixTipo })} onChaveChange={(chavePix) => set({ chavePix })}/>
    </Grupo>}
    {error ? <Alert tone="error">{error}</Alert> : null}
    <Button title={acao ? "Salvar e continuar" : "Salvar alterações"} icon="arrow-forward" onPress={save} loading={submitting}/>
    <Button title="Cancelar" variant="text" onPress={() => router.back()} disabled={submitting}/>
  </Screen>;
}
