import { useState } from "react";
import { View } from "react-native";
import { formatCurrency, parseValor, toValorInput } from "../../shared/client/format.ts";
import { isValidCache } from "../../shared/dominio.ts";
import { space } from "../lib/theme";
import { Alert, Button, Checkbox, Field, type IconName } from "./ui";

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
    <Checkbox label={`Quero propor outro cachê (oferecido: ${formatCurrency(cacheOferecido)})`} checked={propor} onChange={(checked) => { setPropor(checked); setError(""); }}/>
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
