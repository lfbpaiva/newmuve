import { Image } from "react-native";

const logoBranca = require("../assets/logo-branca.png");
const logoRoxa = require("../assets/logo.png");
const PROPORCAO_DA_LOGO = 719 / 320;

export function Logo({ altura = 24, cor = "branca", aoCarregar }: { altura?: number; cor?: "branca" | "roxa"; aoCarregar?: () => void }) {
  return <Image source={cor === "roxa" ? logoRoxa : logoBranca} accessibilityLabel="Muve" onLoadEnd={aoCarregar} style={{ height: altura, width: altura * PROPORCAO_DA_LOGO, resizeMode: "contain" }}/>;
}
