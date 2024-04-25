import path, { isAbsolute } from "path";
import { createInterface } from "readline";
import React, { useEffect, useState } from "react";
import { Box, Text, render, useInput } from "ink";
import { PasswordInput } from "@inkjs/ui";
import { HardhatRuntimeEnvironment } from "./hre.js";
import { UserInterruptionsHooks } from "./types/plugins.js";

await main();

async function main() {
  const then = process.hrtime.bigint();
  const [_node, _main, configPath] = process.argv;

  if (configPath === undefined) {
    console.error("No config file provided");
    return;
  }

  const resolvedConfigPath = isAbsolute(configPath)
    ? configPath
    : path.join(process.cwd(), configPath);

  const config = (await import(resolvedConfigPath)).default;

  if (config === undefined) {
    console.error("No config returned");
    return;
  }

  const hre = await HardhatRuntimeEnvironment.create(config);

  const now = process.hrtime.bigint();
  console.log("Time to initialize the HRE (ms):", (now - then) / 1000000n);

  console.log("\n\n\n");

  // await ignition(hre);
  await inkBasedExampleTask(hre);
}

// This is a prototype of ignition's main task.
//
// In this prototype we use user interactions to ask for the
// user attention and request input, right in the middle of
// ignition's executioon, without breaking its output.
async function _ignitionMockTask(hre: HardhatRuntimeEnvironment) {
  // This code simulates asking the user for a private key in the
  // middle of the execution. It could be from a provider, for example.
  setTimeout(async () => {
    // The private key is lazily fetched, so it uses a user interruption
    // to ask for it.
    const pk = await hre.configVariables.resolve(hre.config.privateKey);
    console.log("Got private key:", pk);
  }, 500);

  // We set custom handlers for the user interruptions, which
  // should be compatible with how ignition prints its output.
  const ignitionInterruptionHooks: UserInterruptionsHooks = {
    async requestSecretInput(
      inputDescription: string,
      requester: string,
      next: (m: string, r: string) => Promise<string>,
    ): Promise<string> {
      console.log(
        "Ignition request secret input (maybe displayed differently)",
      );
      return readlineRequestSecretInput(inputDescription, requester, next);
    },
  };

  hre.hooks.registerHooks("userInterruption", ignitionInterruptionHooks);

  try {
    // This is our "complex" ui
    for (let i = 0; i < 20; i++) {
      // We only print/refresh the ui in an uninterrupted block, so
      // that the user interruptions don't break it.
      await hre.interruptions.uninterrupted(async () => {
        // UI magic ✨
        console.log(`UI refresh: ${i}`);
      });

      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  } finally {
    // Remove the custom hook once we are done
    hre.hooks.unregisterHooks("userInterruption", ignitionInterruptionHooks);
  }
}

async function readlineRequestSecretInput(
  inputDescription: string,
  _requester: string,
  _next: (m: string, r: string) => Promise<string>,
): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const echo = "*"; // or '' if you prefer
  let first: string | undefined;

  (rl as any)._writeToOutput = (c: string) => {
    if (first === undefined || c.length !== 1) {
      if (first === undefined) first = c;
      if (c.startsWith(first)) {
        // rewriting prompt
        (rl as any).output?.write(first);
        c = c.slice(first.length);
      } else if (c.trim() === "") {
        // user pressed enter, show the enter
        (rl as any).output?.write(c);
        c = "";
      }
    }
    for (const _ of c) {
      // all other input, and bits after the prompt, use echo char
      (rl as any).output?.write(echo);
    }
  };

  return new Promise<string>((resolve) => {
    rl.question(`${inputDescription}: `, (answer) => {
      resolve(answer);
      rl.close();
    });
  });
}

async function inkBasedExampleTask(hre: HardhatRuntimeEnvironment) {
  // This code simulates asking the user for a private key in the
  // middle of the execution. It could be from a provider, for example.
  setTimeout(async () => {
    // The private key is lazily fetched, so it uses a user interruption
    // to ask for it.
    const pk = await hre.configVariables.resolve(hre.config.privateKey);
    await hre.interruptions.displayMessage(
      `Got private key: ${pk}`,
      "Configuration variables",
    );

    await hre.interruptions.displayMessage(
      `Please sign in your ledger`,
      "@nomicfoundation/hardhat-ledger",
    );

    await Promise.all([
      hre.interruptions.displayMessage(
        `Please sign in your ledger`,
        "@nomicfoundation/hardhat-ledger",
      ),
      new Promise<void>((resolve) => {
        // sign here... ledger.sign()
        resolve();
      }),
    ]);
  }, 100);

  // eslint-disable-next-line @typescript-eslint/naming-convention
  function App() {
    const [counter, setCounter] = useState(0);

    useEffect(() => {
      const timer = setInterval(() => {
        setCounter((previousCounter) => previousCounter + 1);
      }, 100);

      return () => {
        clearInterval(timer);
      };
    }, []);

    const [requestedSecret, setRequestedSecret] = useState<
      undefined | { description: string; requester: string }
    >(undefined);

    const [returnSecret, setReturnSecret] = useState<
      ((secret: string) => void) | undefined
    >(undefined);

    const [message, setMessage] = useState<
      undefined | { message: string; requester: string }
    >(undefined);

    const [messageResolve, setMessageResolve] = useState<
      (() => void) | undefined
    >(undefined);

    const DismissMessage = () => {
      useInput((_input, key) => {
        if (key.return) {
          setMessage(undefined);
          const mc = messageResolve;
          if (mc !== undefined) {
            setMessageResolve(undefined);
            mc();
          }
        }
      });

      return (
        <Box borderColor={"blueBright"} borderStyle={"round"}>
          <Text>Press enter to dismiss</Text>
        </Box>
      );
    };

    useEffect(() => {
      const inkInterruptions: UserInterruptionsHooks = {
        async requestSecretInput(
          inputDescription: string,
          requester: string,
        ): Promise<string> {
          setRequestedSecret({
            requester,
            description: inputDescription,
          });
          return new Promise((resolve) => {
            setReturnSecret(() => resolve);
          });
        },
        async displayMessage(msg: string, requester: string) {
          setMessage({ message: msg, requester });
          return new Promise((resolve) => {
            setMessageResolve(() => resolve);
          });
        },
      };

      hre.hooks.registerHooks("userInterruption", inkInterruptions);

      return () => {
        hre.hooks.unregisterHooks("userInterruption", inkInterruptions);
      };
    }, []);

    return (
      <Box flexDirection="column" padding={2}>
        <Box>
          <Box padding={1} borderStyle="double" minWidth={80}>
            <Text>Count: {counter}</Text>
          </Box>
        </Box>

        {requestedSecret !== undefined && (
          <Box>
            <Box
              borderStyle="double"
              borderColor={"cyanBright"}
              minWidth={80}
              padding={1}
              flexDirection="column"
            >
              <Box>
                <Text>Request from {requestedSecret.requester}</Text>
              </Box>

              <Box>
                <Text>{requestedSecret.description}: </Text>
                <PasswordInput
                  placeholder="..."
                  onSubmit={(name) => {
                    setRequestedSecret(undefined);

                    if (returnSecret !== undefined) {
                      const r = returnSecret;
                      setRequestedSecret(undefined);
                      r(name);
                    }
                  }}
                />
              </Box>
            </Box>
          </Box>
        )}

        {message !== undefined && (
          <Box>
            <Box
              borderStyle="double"
              borderColor={"cyanBright"}
              minWidth={80}
              flexDirection="column"
              paddingTop={1}
            >
              <Box paddingLeft={1}>
                <Text>Message from {message.requester}</Text>
              </Box>
              <Box>
                <Box
                  marginLeft={1}
                  marginRight={2}
                  marginTop={1}
                  marginBottom={1}
                >
                  <Text>{message.message}</Text>
                </Box>
                <DismissMessage></DismissMessage>
              </Box>
            </Box>
          </Box>
        )}
      </Box>
    );
  }

  render(<App />);
  return;
}
