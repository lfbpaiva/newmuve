import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { eventDateParts } from "../../shared/client/format.ts";
import { colors, radius, space, styles, type } from "../lib/theme";

const RECORTE = 24;

const TINTA_SECUNDARIA = "#55555f";

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return <View style={{ flex: 1, gap: 2 }}>
    <Text style={[type.labelSmall, { color: TINTA_SECUNDARIA }]}>{rotulo}</Text>
    <Text style={[type.titleSmall, { color: colors.bg }]} numberOfLines={1}>{valor}</Text>
  </View>;
}

function Recorte({ lado }: { lado: "left" | "right" }) {
  return <View style={{ position: "absolute", [lado]: -RECORTE / 2, width: RECORTE, height: RECORTE, borderRadius: RECORTE / 2, backgroundColor: colors.bg }}/>;
}

export function HiringTicket({ numero, titulo, inicio, uf, cidade, status, pessoa, valor }: {
  numero: string;
  titulo: string;
  inicio: string;
  uf: string;
  cidade: string;
  status: ReactNode;
  pessoa: { rotulo: string; nome: string } | null;
  valor: { rotulo: string; texto: string } | null;
}) {
  const { cartaz } = eventDateParts(inicio, uf);
  return <View accessibilityLabel={`Ingresso do show ${titulo}, ${cartaz}, ${cidade}`} style={{ borderRadius: radius.sm, backgroundColor: colors.ink, overflow: "hidden" }}>
    <View style={{ padding: space.lg, gap: space.md }}>
      <View style={styles.between}>
        <Text style={[type.label, { color: colors.bg }]}>Muve · Ingresso</Text>
        <Text style={[type.labelSmall, { color: TINTA_SECUNDARIA }]}>Nº {numero}</Text>
      </View>
      <Text style={[type.display, { fontSize: 36, lineHeight: 36, color: colors.bg }]} numberOfLines={3}>{titulo}</Text>
      <View style={{ height: 2, backgroundColor: colors.bg }}/>
      <View style={styles.between}>
        <Text style={[type.label, { color: colors.bg }]}>{cartaz}</Text>
        <Text style={[type.label, { color: colors.bg }]} numberOfLines={1}>{cidade}, {uf}</Text>
      </View>
      <View style={{ alignItems: "flex-start" }}>{status}</View>
    </View>
    {(pessoa || valor) && <>
      <View style={{ height: RECORTE, justifyContent: "center" }}>
        <View style={{ marginHorizontal: RECORTE, borderTopWidth: 2, borderStyle: "dashed", borderColor: "#b9b9c2" }}/>
        <Recorte lado="left"/>
        <Recorte lado="right"/>
      </View>
      <View style={[styles.row, { alignItems: "flex-end", padding: space.lg, paddingTop: space.sm, gap: space.md, backgroundColor: colors.ink }]}>
        {pessoa ? <Campo rotulo={pessoa.rotulo} valor={pessoa.nome}/> : <View style={{ flex: 1 }}/>}
        {valor ? <View style={{ alignItems: "flex-end", gap: 2 }}>
          <Text style={[type.labelSmall, { color: TINTA_SECUNDARIA }]}>{valor.rotulo}</Text>
          <Text style={[type.stat, { fontSize: 30, lineHeight: 32, color: colors.accent }]}>{valor.texto}</Text>
        </View> : null}
      </View>
    </>}
  </View>;
}
