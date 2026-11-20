import { Text, View } from "react-native";
import type { EtapaContratacao, SituacaoEtapa } from "../../shared/client/contratacao.ts";
import { Icon, type IconName } from "./ui";
import { colors, space, type } from "../lib/theme";

const marcador: Record<SituacaoEtapa, { icon: IconName; color: string; fundo: string; rotulo: string }> = {
  feita: { icon: "checkmark", color: colors.bg, fundo: colors.ink, rotulo: "concluída" },
  atual: { icon: "ellipse", color: colors.accentText, fundo: colors.surface2, rotulo: "em andamento" },
  pendente: { icon: "ellipse-outline", color: colors.ink3, fundo: colors.surface, rotulo: "pendente" },
  problema: { icon: "alert", color: colors.error, fundo: colors.errorBg, rotulo: "com problema" },
};

const TAMANHO_MARCADOR = 28;

export function HiringTimeline({ etapas }: { etapas: EtapaContratacao[] }) {
  return <View accessibilityRole="list">
    {etapas.map((etapa, index) => {
      const estilo = marcador[etapa.situacao];
      const ultima = index === etapas.length - 1;
      const destaque = etapa.situacao === "atual";
      return <View key={etapa.titulo} accessibilityLabel={`${etapa.titulo}, ${estilo.rotulo}. ${etapa.detalhe}`} style={{ flexDirection: "row", gap: space.md }}>
        <View style={{ alignItems: "center", width: TAMANHO_MARCADOR }}>
          <View style={{ width: TAMANHO_MARCADOR, height: TAMANHO_MARCADOR, borderRadius: TAMANHO_MARCADOR / 2, backgroundColor: estilo.fundo, borderWidth: destaque ? 2 : 1, borderColor: destaque ? colors.accent : etapa.situacao === "pendente" ? colors.line : estilo.fundo, alignItems: "center", justifyContent: "center" }}>
            <Icon name={estilo.icon} size={destaque ? 10 : 16} color={estilo.color}/>
          </View>
          {!ultima && <View style={{ flex: 1, width: 2, minHeight: space.lg, backgroundColor: etapa.situacao === "feita" ? colors.ink : colors.line }}/>}
        </View>
        <View style={{ flex: 1, gap: 2, paddingTop: 3, paddingBottom: ultima ? 0 : space.lg }}>
          <Text style={[type.titleSmall, { color: etapa.situacao === "pendente" ? colors.ink2 : etapa.situacao === "problema" ? colors.error : colors.ink }]}>{etapa.titulo}</Text>
          <Text style={[type.bodySmall, destaque && { color: colors.accentText }]}>{etapa.detalhe}</Text>
        </View>
      </View>;
    })}
  </View>;
}
