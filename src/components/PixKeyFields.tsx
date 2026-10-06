import { ROTULOS_CHAVE_PIX, TIPOS_CHAVE_PIX } from "../../shared/dominio.ts";
import { maskCNPJ, maskCPF, maskPhone } from "../utils/validators";
import { Field } from "./ui";

interface Props {
  tipo: string;
  chave: string;
  onTipoChange: (tipo: string) => void;
  onChaveChange: (chave: string) => void;
}

const placeholders: Record<string, string> = {
  CPF: "000.000.000-00",
  CNPJ: "00.000.000/0000-00",
  EMAIL: "voce@exemplo.com",
  PHONE: "(00) 00000-0000",
  EVP: "00000000-0000-0000-0000-000000000000",
};

const mask = (tipo: string, value: string) =>
  tipo === "CPF" ? maskCPF(value) : tipo === "CNPJ" ? maskCNPJ(value) : tipo === "PHONE" ? maskPhone(value) : value;

// Chave Pix do músico: é para ela que o cachê é transferido após o show.
export default function PixKeyFields({ tipo, chave, onTipoChange, onChaveChange }: Props) {
  return <>
    <label className="field"><span>Tipo da chave Pix</span><select value={tipo} onChange={(e) => { onTipoChange(e.target.value); onChaveChange(""); }}>
      <option value="">Selecione</option>
      {TIPOS_CHAVE_PIX.map((t) => <option key={t} value={t}>{ROTULOS_CHAVE_PIX[t]}</option>)}
    </select></label>
    <Field label="Chave Pix (para receber os cachês)" placeholder={placeholders[tipo] ?? "Escolha o tipo primeiro"} value={chave} onChange={(value) => onChaveChange(mask(tipo, value))}/>
  </>;
}
