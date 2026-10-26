import { CASA_PRECO, CASA_SEMANAS_MAXIMAS, COMISSAO_CASA_PERCENTUAL, COMISSAO_PERCENTUAL } from "../../shared/dominio.ts";
import { PlanScreen } from "../components/PlanScreen";

export default function CasaScreen() {
  return <PlanScreen
    nome="Muve Casa"
    preco={CASA_PRECO}
    beneficios={[
      { icon: "pricetag-outline", titulo: `Taxa de ${COMISSAO_CASA_PERCENTUAL}% em vez de ${COMISSAO_PERCENTUAL}%`, texto: "Em todas as contratações. Com 4 shows de R$ 500 no mês, a economia passa da mensalidade." },
      { icon: "repeat-outline", titulo: "Eventos recorrentes", texto: `"Toda sexta, 21h" vira até ${CASA_SEMANAS_MAXIMAS} eventos de uma vez.` },
      { icon: "heart-outline", titulo: "Favoritos e convite direto", texto: "Salve quem já tocou bem e convide para o próximo evento sem esperar inscrições." },
      { icon: "calendar-outline", titulo: "Agenda do mês", texto: "Veja num calendário o que já está contratado e o que ainda está aberto." },
    ]}
    observacao="O Casa não muda nada para o músico: ele recebe o cachê inteiro, com a mesma garantia, e as regras de cancelamento são iguais para todos."
  />;
}
