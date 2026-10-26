import { Text, View } from "react-native";
import { formatCurrency } from "../../shared/client/format.ts";
import { CACHE_MINIMO, COBRANCA_VALIDADE_MS, COMISSAO_PERCENTUAL, RAIO_MAXIMO_KM, TERMOS_VERSAO } from "../../shared/dominio.ts";
import { Heading, Screen } from "../components/ui";
import { colors, space, styles, type } from "../lib/theme";

const versao = TERMOS_VERSAO.split("-").reverse().join("/");

const secoes: { titulo: string; paragrafos: string[] }[] = [
  {
    titulo: "1. O que é a Muve",
    paragrafos: [
      "A Muve aproxima músicos e contratantes de eventos. O contratante publica o evento, músicos compatíveis se candidatam e o contratante escolhe quem vai tocar.",
      "A Muve é um projeto acadêmico (Trabalho de Conclusão de Curso). Os pagamentos rodam no ambiente de testes da Asaas e não movimentam dinheiro real.",
      "A apresentação é combinada entre músico e contratante. A Muve organiza a contratação e o pagamento, mas não é parte do show.",
    ],
  },
  {
    titulo: "2. Sua conta",
    paragrafos: [
      "Informe dados verdadeiros. Cada CPF ou CNPJ pode estar em apenas uma conta, e você responde pelo uso do seu acesso.",
      "Para se candidatar, o músico precisa de foto, CPF ou CNPJ, telefone, cidade, estilos musicais e chave Pix. Para publicar eventos e pagar, o contratante precisa de foto, CPF ou CNPJ, telefone e cidade.",
    ],
  },
  {
    titulo: "3. Como funciona a contratação",
    paragrafos: [
      `O evento aparece para músicos da mesma cidade ou a até ${RAIO_MAXIMO_KM} km, com estilos compatíveis. O endereço completo só é mostrado ao músico contratado.`,
      "Ao se inscrever, o músico aceita o cachê oferecido ou propõe outro valor, que pode alterar enquanto a inscrição aguarda resposta. Músico e contratante podem conversar pela inscrição para combinar repertório, horário e valor.",
      `O contratante aprova um candidato pagando a cobrança Pix, que vale por ${COBRANCA_VALIDADE_MS / 60000} minutos. A contratação só é efetivada quando a Asaas confirma o pagamento.`,
    ],
  },
  {
    titulo: "4. Valores e taxa",
    paragrafos: [
      `O cachê é o valor oferecido pelo contratante ou, se o músico tiver feito uma proposta, o valor proposto por ele, sempre com mínimo de ${formatCurrency(CACHE_MINIMO)}. A Muve cobra uma taxa de serviço de ${COMISSAO_PERCENTUAL}% somada ao cachê, paga pelo contratante. O músico recebe o cachê integral.`,
    ],
  },
  {
    titulo: "5. Pagamento retido e repasse",
    paragrafos: [
      "O valor pago fica retido pela Muve até o show acontecer. Depois do início do evento, músico e contratante confirmam a realização, cada um na própria conta.",
      "Com as duas confirmações, o cachê é transferido por Pix para a chave cadastrada pelo músico. Se só uma parte confirmar, o show é dado como realizado 7 dias após a data.",
    ],
  },
  {
    titulo: "6. Cancelamentos",
    paragrafos: [
      "Se o músico contratado desistir antes do início, o contratante recebe o valor integral de volta e o evento volta a receber candidaturas.",
      "Se o contratante cancelar com mais de 24 horas de antecedência, recebe o valor integral de volta. Com menos de 24 horas, não há devolução e o cachê é repassado ao músico.",
      "Se o músico não comparecer, o contratante pode registrar a ausência depois do horário do evento, enquanto o músico não tiver confirmado o show, e recebe o valor integral de volta.",
      "Depois do início do evento não há cancelamento. A devolução só conta como feita quando a Asaas a confirma.",
    ],
  },
  {
    titulo: "7. Avaliações",
    paragrafos: [
      "Depois que o show é concluído, músico e contratante se avaliam com notas de 1 a 5. As notas são públicas no perfil e não podem ser alteradas.",
    ],
  },
  {
    titulo: "8. O que não é permitido",
    paragrafos: [
      "Usar dados de outra pessoa, publicar eventos falsos, enviar fotos, textos ou mensagens ofensivas e usar a Muve para fraudes. Contas nessas situações podem ser excluídas.",
      "Pagamentos combinados fora da Muve não têm a garantia do valor retido, nem as regras de cancelamento e devolução destes termos.",
    ],
  },
  {
    titulo: "9. Seus dados",
    paragrafos: [
      "Usamos seus dados apenas para operar a contratação, conforme a Lei Geral de Proteção de Dados (LGPD). CPF ou CNPJ e chave Pix nunca aparecem para outros usuários; o telefone só é compartilhado com a outra parte depois de uma contratação.",
      "Pagamentos são processados pela Asaas. Você pode excluir sua conta a qualquer momento em Ajustes, exceto enquanto houver um show contratado em andamento.",
    ],
  },
  {
    titulo: "10. Alterações",
    paragrafos: [
      "Quando estes termos mudarem, a nova versão aparece nesta tela com a data atualizada.",
    ],
  },
];

export default function TermsScreen() {
  return <Screen>
    <Heading title="Termos de Uso" subtitle={`Versão de ${versao}. Ao criar uma conta, você concorda com estas regras.`}/>
    <View style={[styles.card, { gap: space.xl }]}>
      {secoes.map((secao) => <View key={secao.titulo} style={{ gap: space.sm }}>
        <Text style={type.titleSmall}>{secao.titulo}</Text>
        {secao.paragrafos.map((paragrafo) => <Text key={paragrafo} style={[type.bodySmall, { color: colors.ink2 }]}>{paragrafo}</Text>)}
      </View>)}
    </View>
  </Screen>;
}
