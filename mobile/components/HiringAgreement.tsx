import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { eventDateParts } from "../../shared/client/format.ts";
import { colors, radius, space, styles, type } from "../lib/theme";
import { Avatar, Icon, Surface } from "./ui";

export interface Parte {
  papel: string;
  nome: string;
  foto?: string | null;
  voce: boolean;
}

function LadoDoAcordo({ parte, alinhar }: { parte: Parte; alinhar: "flex-start" | "flex-end" }) {
  return <View style={{ flex: 1, alignItems: alinhar, gap: space.sm }}>
    <View style={{ borderRadius: radius.pill, padding: 2, borderWidth: 1, borderColor: parte.voce ? "rgba(139,107,255,0.5)" : colors.hairline }}>
      <Avatar uri={parte.foto} name={parte.nome} size={48}/>
    </View>
    <View style={{ alignItems: alinhar, gap: 2 }}>
      <Text style={type.labelSmall}>{parte.papel}{parte.voce ? " · você" : ""}</Text>
      <Text style={[type.titleSmall, { textAlign: alinhar === "flex-end" ? "right" : "left" }]} numberOfLines={2}>{parte.nome}</Text>
    </View>
  </View>;
}

export function HiringAgreement({ numero, titulo, inicio, uf, cidade, status, contratante, musico, valor, situacaoDoValor }: {
  numero: string;
  titulo: string;
  inicio: string;
  uf: string;
  cidade: string;
  status: ReactNode;
  contratante: Parte;
  musico: Parte;
  valor: string | null;
  situacaoDoValor: string;
}) {
  const { weekday, day, month, time } = eventDateParts(inicio, uf);
  return <View accessibilityLabel={`Acordo entre ${contratante.nome} e ${musico.nome} para ${titulo}. ${valor ? `${valor}, ${situacaoDoValor}` : ""}`} style={{ gap: space.lg }}>
    <View style={{ gap: space.sm }}>
      <View style={styles.between}>
        {status}
        <Text style={type.labelSmall}>Acordo nº {numero}</Text>
      </View>
      <Text style={[type.display, { fontSize: 28, lineHeight: 32 }]} numberOfLines={3} accessibilityRole="header">{titulo}</Text>
      <View style={[styles.row, { gap: space.lg, flexWrap: "wrap" }]}>
        <View style={[styles.row, { gap: 6 }]}><Icon name="calendar-outline" size={14} color={colors.ink3}/><Text style={type.bodySmall}>{weekday} {day} {month} · {time}</Text></View>
        <View style={[styles.row, { gap: 6 }]}><Icon name="location-outline" size={14} color={colors.ink3}/><Text style={type.bodySmall}>{cidade}, {uf}</Text></View>
      </View>
    </View>

    <Surface destaque>
      <View style={[styles.row, { alignItems: "flex-start" }]}>
        <LadoDoAcordo parte={contratante} alinhar="flex-start"/>
        <LadoDoAcordo parte={musico} alinhar="flex-end"/>
      </View>
      <View style={{ alignItems: "center", justifyContent: "center", minHeight: 76 }}>
        <View style={{ position: "absolute", left: 24, right: 24, top: 37, height: 1, backgroundColor: "rgba(139,107,255,0.35)" }}/>
        <View style={{ alignItems: "center", gap: 2, paddingHorizontal: space.lg, paddingVertical: space.sm, backgroundColor: colors.surface2, borderWidth: 1, borderColor: "rgba(139,107,255,0.4)", borderRadius: radius.md }}>
          <Text style={[type.labelSmall, { color: colors.accentText }]}>Muve no meio</Text>
          {valor ? <Text style={[type.price, { color: colors.ink }]}>{valor}</Text> : null}
        </View>
      </View>
      <View style={[styles.row, { gap: space.sm, justifyContent: "center" }]}>
        <Icon name="shield-checkmark-outline" size={16} color={colors.accentText}/>
        <Text style={[type.bodySmall, { textAlign: "center", flexShrink: 1 }]}>{situacaoDoValor}</Text>
      </View>
    </Surface>
  </View>;
}
