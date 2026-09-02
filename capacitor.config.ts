import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.savarona.haltakip",
  appName: "HAL Takip",
  webDir: "dist/client",
  android: {
    allowMixedContent: false,
    backgroundColor: "#07111f"
  }
};

export default config;
