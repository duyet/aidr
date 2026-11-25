"use client";

import { DEFAULT_THEME } from "@aidr/libs/reader-view";
import { ThemeProvider, type ThemeProviderProps } from "next-themes";

export default function Providers({ children, ...props }: ThemeProviderProps) {
  return (
    <ThemeProvider
      defaultTheme={DEFAULT_THEME}
      attribute="class"
      enableSystem={true}
      disableTransitionOnChange
      {...props}
    >
      {children}
    </ThemeProvider>
  );
}
