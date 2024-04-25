import { HookManager } from "../types/hooks.js";
import { UserInterruptionManager } from "../types/user-interruptions.js";
import { AsyncMutex } from "./async-mutex.js";

export class UserInterruptionManagerImplementation
  implements UserInterruptionManager
{
  readonly #hooks;
  readonly #mutex = new AsyncMutex();

  constructor(hooks: HookManager) {
    this.#hooks = hooks;
  }

  public async displayMessage(
    interruptor: string,
    message: string,
  ): Promise<void> {
    return this.#mutex.excluiveRun(async () => {
      return this.#hooks.runHooksChain(
        "userInterruption",
        "displayMessage",
        [interruptor, message],
        defaultDisplayMessage,
      );
    });
  }

  public async requestInput(
    interruptor: string,
    inputDescription: string,
  ): Promise<string> {
    return this.#mutex.excluiveRun(async () => {
      return this.#hooks.runHooksChain(
        "userInterruption",
        "requestInput",
        [interruptor, inputDescription],
        defaultRequestInput,
      );
    });
  }

  public async requestSecretInput(
    interruptor: string,
    inputDescription: string,
  ): Promise<string> {
    return this.#mutex.excluiveRun(async () => {
      return this.#hooks.runHooksChain(
        "userInterruption",
        "requestSecretInput",
        [interruptor, inputDescription],
        defaultRequestSecretInput,
      );
    });
  }

  public async uninterrupted<ReturnT>(
    f: () => ReturnT,
  ): Promise<Awaited<ReturnT>> {
    return this.#mutex.excluiveRun(f);
  }
}

async function defaultDisplayMessage(interruptor: string, message: string) {
  console.log(`[${interruptor}]: ${message}`);
}

async function defaultRequestInput(
  interruptor: string,
  inputDescription: string,
) {
  const { default: enquirer } = await import("enquirer");
  const questions = [
    {
      type: "input",
      name: "input",
      message: `[${interruptor}] ${inputDescription}`,
    },
  ];

  const answers = (await enquirer.prompt(questions)) as any;
  return answers.input;
}

async function defaultRequestSecretInput(
  interruptor: string,
  inputDescription: string,
) {
  const { default: enquirer } = await import("enquirer");
  const questions = [
    {
      type: "password",
      name: "input",
      message: `[${interruptor}] ${inputDescription}`,
    },
  ];

  const answers = (await enquirer.prompt(questions)) as any;
  return answers.input;
}
