/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Self-hosted font packages ship CSS only (no type declarations).
declare module "@fontsource-variable/*";
declare module "@fontsource/*";
