import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { formatCurrency, parseValor, toValorInput } from "../../shared/client/format.ts";
import { isValidCache } from "../../shared/dominio.ts";
import { colors, radius, space, type } from "../lib/theme";
import { Alert, Button, Field, type IconName } from "./ui";

function Opcao({ ativa, titulo, detalhe, onPress }: { ativa: boolean; titulo: string; detalhe: string; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: ativa }} onPress={onPress} style={({ pressed }) => ({ flex: 1, gap: 2, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: ativa ? "rgba(139,107,255,0.55)" : colors.hairline, backgroundColor: ativa ? colors.accentSoft : pressed ? colors.surface2 : colors.surface })}>
    <Text style={[type.titleSmall, { fontSize: 14, color: ativa ? colors.ink : colors.ink2 }]}>{titulo}</Text>
    <Text style={[type.bodySmall, { fontSize: 12, lineHeight: 16 }]}>{detalhe}</Text>
  </Pressable>;
}

export function ProposalForm({ cacheOferecido, valorAtual, submitLabel, icon, busy, onSubmit }: {
  cacheOferecido: number;
  valorAtual: number | null;
  submitLabel: string;
  icon: IconName;
  busy: boolean;
  onSubmit: (valorProposto: number | null) => void;
}) {
  const [propor, setPropor] = useState(valorAtual !== null);
  const [valor, setValor] = useState(valorAtual === null ? "" : toValorInput(valorAtual));
  const [error, setError] = useState("");
  const numero = parseValor(valor);

  function submit() {
    if (!propor) return onSubmit(null);
    if (!isValidCache(numero)) return setError("O valor mínimo é de R$ 100,00.");
    onSubmit(numero);
  }

  return <View style={{ gap: space.md }}>
    <View accessibilityRole="radiogroup" style={{ flexDirection: "row", gap: space.sm }}>
      <Opcao ativa={!propor} titulo="Aceito o cachê" detalhe={formatCurrency(cacheOferecido)} onPress={() => { setPropor(false); setError(""); }}/>
      <Opcao ativa={propor} titulo="Propor outro valor" detalhe="O contratante decide" onPress={() => { setPropor(true); setError(""); }}/>
    </View>
    {propor && <Field
      label="Seu cachê (R$)"
      value={valor}
      onChangeText={(v) => { setValor(v.replace(/[^\d.,]/g, "")); setError(""); }}
      keyboardType="decimal-pad"
      placeholder="100,00 ou mais"
      hint={isValidCache(numero) ? `Se o contratante aprovar, você recebe ${formatCurrency(numero)}.` : "O contratante vê o seu valor ao lado do oferecido e decide."}
    />}
    {error ? <Alert tone="error">{error}</Alert> : null}
    <Button title={submitLabel} icon={icon} loading={busy} onPress={submit}/>
  </View>;
}
