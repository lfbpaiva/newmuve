interface FormularioDaContestacao {
  aberto: boolean;
  motivo: string;
}

export const FORMULARIO_FECHADO: FormularioDaContestacao = { aberto: false, motivo: "" };

export const depoisDoEnvio = (formulario: FormularioDaContestacao, enviada: boolean): FormularioDaContestacao => (enviada ? FORMULARIO_FECHADO : formulario);
