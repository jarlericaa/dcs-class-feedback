import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx}", "../../packages/ui/src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#000000",
        "primary-foreground": "#ffffff",
        secondary: "#f5f5f5",
        "secondary-foreground": "#000000",
        destructive: "#ef4444",
        "destructive-foreground": "#ffffff",
        muted: "#f5f5f5",
        "muted-foreground": "#666666",
        accent: "#f5f5f5",
        "accent-foreground": "#000000",
        ring: "#000000",
      },
    },
  },
  plugins: [],
};

export default config;
