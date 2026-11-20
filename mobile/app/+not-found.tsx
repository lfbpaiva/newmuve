import { router, Stack } from "expo-router";
import { Text } from "react-native";
import { Button, EmptyState, Screen } from "../components/ui";
import { type } from "../lib/theme";

export default function PaginaNaoEncontrada() {
  return <Screen>
    <Stack.Screen options={{ title: "Página não encontrada" }}/>
    <EmptyState title="Página não encontrada" icon="search" action={<Button title="Voltar para o início" icon="home-outline" block={false} onPress={() => router.replace("/")}/>}>
      <Text style={type.bodySmall}>Este endereço não existe ou foi removido.</Text>
    </EmptyState>
  </Screen>;
}
