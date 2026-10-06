import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { deleteAccount } from "../../../shared/client/account.ts";
import { errorMessage } from "../../../shared/client/api.ts";
import { sanitizeEmail } from "../../../shared/client/validators.ts";
import { Alert, Button, Field, Heading, Icon, PasswordField, Screen } from "../../components/ui";
import { colors, space, styles, type } from "../../lib/theme";
import { useMe } from "../../lib/useMe";

export default function DeleteAccountScreen() {
  const me = useMe();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function confirm() {
    if (email !== me.email || !password) return setError("E-mail ou senha não correspondem à conta atual.");
    setSubmitting(true);
    try {
      // A API confere a senha novamente; ao concluir, a sessão é encerrada e o AuthGate volta ao login.
      await deleteAccount(email, password);
    } catch (e) {
      setError(errorMessage(e));
      setSubmitting(false);
    }
  }

  return <Screen>
    <Heading title="Excluir conta" subtitle="Esta ação é permanente."/>
    <View style={[styles.card, { gap: space.md }]}>
      {[
        "Seu perfil, eventos, candidaturas e avaliações serão apagados.",
        "Registros de pagamentos já realizados são mantidos, sem vínculo com você, por obrigação fiscal.",
        "Você poderá criar uma nova conta com o mesmo CPF/CNPJ no futuro.",
      ].map((text) => <View key={text} style={[styles.row, { alignItems: "flex-start", gap: 10 }]}><Icon name="remove-circle-outline" size={18} color={colors.error}/><Text style={[type.bodySmall, { flex: 1 }]}>{text}</Text></View>)}
    </View>
    <Text style={type.body}>Para confirmar, digite o e-mail e a senha da conta.</Text>
    <Field label="E-mail da conta" value={email} onChangeText={(v) => { setEmail(sanitizeEmail(v)); setError(""); }} autoCapitalize="none" keyboardType="email-address"/>
    <PasswordField label="Senha" value={password} onChangeText={(v) => { setPassword(v); setError(""); }}/>
    {error ? <Alert tone="error">{error}</Alert> : null}
    <Button variant="danger" title="Excluir minha conta definitivamente" icon="trash-outline" onPress={confirm} loading={submitting} disabled={!email || !password}/>
    <Button variant="text" title="Manter minha conta" onPress={() => router.back()} disabled={submitting}/>
  </Screen>;
}
