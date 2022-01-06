import websocketSignaling from "./websocket-signaling.js";
import encryptedSignaling from "./encrypted-signaling.js";
import peerSessionFactory from "./peer-session.js";
import virtualPortFactory from "./virtual-port.js";
import fs from "fs";
import { v4 } from "uuid";
import bridgeFactory from "./bridge.js";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import path from "path";
import loggerFactory from "./logger.js";
import whyIsNodeRunning from "why-is-node-running";

const { argv } = yargs(hideBin(process.argv))
  .usage("Usage: yal2vpn -c [config.json]")
  .demandOption(["config"])
  .describe("c", "config file to use")
  .alias("c", "config")
  .strict();

process.on("SIGUSR1", () => {
  whyIsNodeRunning();
});
// setInterval(() => {
//   global.gc();
// }, 200);

const logger = loggerFactory.create({});

const configFilePath = path.resolve(argv.config);
logger.log(`using config file "${configFilePath}"`);
const configFileDirectory = path.dirname(configFilePath);

const configAsString = fs.readFileSync(argv.config, "utf8");
const config = JSON.parse(configAsString);

if (!config.privateKeyFile) {
  throw Error("config needs privateKeyFile");
}

if (typeof config.publicKeyFiles !== "object") {
  throw Error("config needs publicKeyFiles object");
}

if (!config.bridgeName) {
  throw Error("config needs bridgeName");
}

const privateKeyFile = path.resolve(configFileDirectory, config.privateKeyFile);
logger.log(`using private key file "${privateKeyFile}"`);
const privateKey = fs.readFileSync(privateKeyFile, "utf8");

let publicKeys = {};
Object.keys(config.publicKeyFiles).forEach((name) => {
  const publicKeyFile = path.resolve(
    configFileDirectory,
    config.publicKeyFiles[name]
  );
  logger.log(`using public key file "${publicKeyFile}" to identify "${name}"`);

  publicKeys = {
    ...publicKeys,
    [name]: fs.readFileSync(publicKeyFile, "utf8"),
  };
});

const clientId = v4();
logger.log(`using client id ${clientId}`);

bridgeFactory
  .createOrHijack({ bridgeName: config.bridgeName })
  .then((bridge) => {
    let peerSessions = {};
    let cleanupInProgress = false;

    const cleanupAtExit = () => {
      if (cleanupInProgress) {
        return;
      }

      cleanupInProgress = true;

      Object.keys(peerSessions).forEach((key) => {
        peerSessions[key].close();
      });

      Promise.resolve()
        .then(() => {
          // logger.log("removing bridge");
          // return bridge.deleteLink();
        })
        .then(() => {
          console.log("calling process exit");
          process.exit(0);
        })
        .catch((err) => {
          console.error("failed to remove bridge", err);
          process.exit(-1);
        });
    };

    process.on("SIGINT", cleanupAtExit);
    process.on("SIGTERM", cleanupAtExit);
    process.on("uncaughtException", (err) => {
      console.error("uncauhgtException", err);
      cleanupAtExit();
    });
    process.on("unhandledRejection", (err) => {
      console.error("unhandledRejection", err);
      cleanupAtExit();
    });

    const townhall = websocketSignaling.create({
      logger,
      url: "ws://3.69.253.209:8080/644c4f6c-fa52-4285-9317-69c14b599d79",
    });
    const secureTownhall = encryptedSignaling.create({
      townhall,
      publicKeys,
      privateKey,
    });

    const sendHello = () => {
      const packet = {
        type: "hello",
        from: clientId,
      };

      secureTownhall.send({ packet });
    };

    secureTownhall.on("connected", () => {
      sendHello();
    });

    secureTownhall.on("disconnected", () => {
      logger.warn("lost connection to signaling server");
    });

    setInterval(() => {
      sendHello();
    }, 60 * 1000);

    secureTownhall.on("message", ({ key, packet }) => {
      if (packet.from === clientId) {
        return;
      }

      if (packet.to !== undefined && packet.to !== clientId) {
        return;
      }

      console.log("packet =", packet);

      let peerSession = peerSessions[packet.from];

      if (!peerSession) {
        const name = Object.keys(publicKeys).find((n) => {
          return publicKeys[n] === key;
        });

        peerSession = peerSessionFactory.create({
          logger,
          name,
          bridge,
          publicKey: publicKeys[name],
          sendToTownhall: secureTownhall.send,
          peerId: packet.from,
          clientId,
        });

        peerSession.on("dead", () => {
          peerSession.close();

          const { [packet.from]: _, ...other } = peerSessions;
          peerSessions = {
            ...other,
          };
        });

        peerSessions = {
          ...peerSessions,
          [packet.from]: peerSession,
        };
      }

      try {
        peerSession.processPacket({ packet });
      } catch (ex) {
        logger.error(
          "failed to process packet",
          packet,
          "resulted in exception",
          ex
        );
        logger.error("destroying associated peer session...");

        try {
          peerSession.close();
        } catch (ex) {
          logger.error("closing of peer session not possible", ex);
        }

        const { [packet.from]: _, ...other } = peerSessions;
        peerSessions = {
          ...other,
        };
      }
    });
  });

// const publicKeys = {
//   bob: fs.readFileSync("./keys/bob/key.pub", "utf8"),
//   alice: fs.readFileSync("./keys/alice/key.pub", "utf8"),
// };

// const keyNameToUse = process.argv[2];
// if (!keyNameToUse) {
//   throw Error("key name needs to be provided");
// }

// const privateKey = fs.readFileSync(`./keys/${keyNameToUse}/key`, "utf8");

// const bridge = {
//   connect() {
//     return Promise.resolve();
//   }
// };

// for(let i = 0; i < 10; i += 1) {
//   virtualPortFactory.create({ bridge });
// }

// const virtualPort = virtualPortFactory.create({ bridge });
