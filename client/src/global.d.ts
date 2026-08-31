export {};

declare global {
  interface Window {
    keystone?: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
    };
  }
}
