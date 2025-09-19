declare const process: {
  env: { [key: string]: string | undefined };
  exit(code?: number): never;
};

export {};
