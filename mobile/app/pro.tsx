import { PRO_ANTECIPACAO_HORAS, PRO_PRECO, PRO_RAIO_MAXIMO_KM } from "../../shared/dominio.ts";
import { PlanScreen } from "../components/PlanScreen";

export default function ProScreen() {
  return <PlanScreen
    nome="Muve Pro"
    preco={PRO_PRECO}
    beneficios={[
      { icon: "flash-outline", titulo: `Eventos ${PRO_ANTECIPACAO_HORAS}h antes`, texto: "Eventos novos marcados com mais de 7 dias de antecedência aparecem primeiro para você." },
      { icon: "trending-up-outline", titulo: "Destaque nas inscrições", texto: "Você aparece no topo da lista de candidatos, com o selo Pro." },
      { icon: "navigate-outline", titulo: `Raio de até ${PRO_RAIO_MAXIMO_KM} km`, texto: "Para quem toca em várias cidades da região." },
    ]}
    observacao="O Pro não muda as regras: a garantia do pagamento, os cancelamentos, as multas e as avaliações são iguais para todos."
  />;
}
