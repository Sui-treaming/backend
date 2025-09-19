declare namespace NodeJS {
  interface ProcessEnv {
    [key: string]: string | undefined;
  }

  interface Process {
    env: ProcessEnv;
    exit(code?: number): never;
  }
}

declare const process: NodeJS.Process;

export {};
