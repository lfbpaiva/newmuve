import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import type { UploadFile } from "../../shared/client/config.ts";
import { maskCNPJ, maskCPF, maskPhone } from "../../shared/client/validators.ts";
import { imageProblem, ROTULOS_CHAVE_PIX, TIPOS_CHAVE_PIX, UFS } from "../../shared/dominio.ts";
import { colors, radius, space, type } from "../lib/theme";
import { Field, Icon, Select } from "./ui";

// Campos compostos compartilhados por cadastro, perfil e evento.

export function LocationFields({ uf, cidade, onUfChange, onCidadeChange, onError }: { uf: string; cidade: string; onUfChange: (uf: string) => void; onCidadeChange: (cidade: string) => void; onError?: (message: string) => void }) {
  const [loaded, setLoaded] = useState<{ uf: string; cidades: string[] }>({ uf: "", cidades: [] });
  const loading = Boolean(uf) && loaded.uf !== uf;
  const cidades = loaded.uf === uf ? loaded.cidades : [];

  useEffect(() => {
    if (!uf) return;
    const controller = new AbortController();
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("IBGE request failed");
        return response.json();
      })
      .then((data: { nome: string }[]) => setLoaded({ uf, cidades: data.map((c) => c.nome) }))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setLoaded({ uf, cidades: [] });
        onError?.("Não foi possível carregar as cidades do IBGE.");
      });
    return () => controller.abort();
  }, [uf, onError]);

  return <View style={{ flexDirection: "row", gap: space.md }}>
    <View style={{ width: 110 }}><Select label="Estado" value={uf} options={UFS.map((u) => ({ value: u, label: u }))} onChange={(next) => { onUfChange(next); onCidadeChange(""); }}/></View>
    <View style={{ flex: 1 }}><Select label="Cidade" value={cidade} options={cidades.map((c) => ({ value: c, label: c }))} searchable disabled={!uf || loading || cidades.length === 0} placeholder={loading ? "Carregando..." : uf ? "Selecione a cidade" : "Escolha o estado"} onChange={onCidadeChange}/></View>
  </View>;
}

const pixMask = (tipo: string, value: string) =>
  tipo === "CPF" ? maskCPF(value) : tipo === "CNPJ" ? maskCNPJ(value) : tipo === "PHONE" ? maskPhone(value) : value;

export function PixKeyFields({ tipo, chave, onTipoChange, onChaveChange }: { tipo: string; chave: string; onTipoChange: (tipo: string) => void; onChaveChange: (chave: string) => void }) {
  return <>
    <Select label="Tipo da chave Pix" value={tipo} options={TIPOS_CHAVE_PIX.map((t) => ({ value: t, label: ROTULOS_CHAVE_PIX[t] }))} onChange={(next) => { onTipoChange(next); onChaveChange(""); }}/>
    <Field label="Chave Pix" hint="É para esta chave que o cachê é transferido após o show." value={chave} onChangeText={(value) => onChaveChange(pixMask(tipo, value))} autoCapitalize="none" placeholder={tipo ? "" : "Escolha o tipo primeiro"} editable={Boolean(tipo)} keyboardType={tipo === "EMAIL" ? "email-address" : tipo === "EVP" ? "default" : "numeric"}/>
  </>;
}

/** Seleciona uma imagem da galeria e a prepara para envio multipart. */
export function ImageField({ label, preview, shape = "circle", onPick, onError }: { label: string; preview: string; shape?: "circle" | "banner"; onPick: (file: UploadFile, uri: string) => void; onError: (message: string) => void }) {
  async function pick() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return onError("Permita o acesso às fotos para escolher uma imagem.");
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85, allowsEditing: true, aspect: shape === "banner" ? [16, 9] : [1, 1] });
    if (result.canceled) return;
    const asset = result.assets[0];
    const mime = asset.mimeType ?? "image/jpeg";
    const problem = imageProblem({ type: mime, size: asset.fileSize ?? 0 });
    if (problem) return onError(problem);
    const extension = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    onPick({ uri: asset.uri, name: `imagem.${extension}`, type: mime }, asset.uri);
  }

  if (shape === "banner") {
    return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={pick} style={({ pressed }) => ({ height: 170, borderRadius: radius.lg, overflow: "hidden", backgroundColor: pressed ? colors.surface3 : colors.surface2, alignItems: "center", justifyContent: "center", gap: 6 })}>
      {preview ? <Image source={{ uri: preview }} style={{ width: "100%", height: "100%" }}/> : <Icon name="image-outline" size={30} color={colors.ink2}/>}
      {!preview && <Text style={type.label}>{label}</Text>}
      {!preview && <Text style={type.bodySmall}>PNG, JPEG ou WebP, até 5 MB</Text>}
      {preview && <View style={{ position: "absolute", right: 10, bottom: 10, backgroundColor: "#0f1016cc", borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", gap: 6, alignItems: "center" }}><Icon name="camera-outline" size={14}/><Text style={type.labelSmall}>Trocar</Text></View>}
    </Pressable>;
  }

  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={pick} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, borderRadius: radius.lg, padding: space.md, backgroundColor: pressed ? colors.surface2 : colors.surface })}>
    {preview
      ? <Image source={{ uri: preview }} style={{ width: 64, height: 64, borderRadius: 32 }}/>
      : <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" }}><Icon name="camera-outline" size={24} color={colors.ink}/></View>}
    <View style={{ flex: 1 }}><Text style={type.titleSmall}>{label}</Text><Text style={type.bodySmall}>PNG, JPEG ou WebP, até 5 MB</Text></View>
    <Icon name="chevron-forward" size={18} color={colors.ink2}/>
  </Pressable>;
}
