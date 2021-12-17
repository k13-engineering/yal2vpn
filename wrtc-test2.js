import websocketSignaling from "./websocket-signaling.js";
import encryptedSignaling from "./encrypted-signaling.js";
import peerSessionFactory from "./peer-session.js";
import fs from "fs";
import { v4 } from "uuid";
import rtnetlink from "../node-rtnetlink/index.js";
import brdigeFactory from "./bridge.js";

const publicKeys = {
  bob: fs.readFileSync("./keys/bob/key.pub", "utf8"),
  alice: fs.readFileSync("./keys/alice/key.pub", "utf8"),
};

const keyNameToUse = process.argv[2];
if (!keyNameToUse) {
  throw Error("key name needs to be provided");
}

const clientId = v4();

const privateKey = fs.readFileSync(`./keys/${keyNameToUse}/key`, "utf8");
const publicKey = fs.readFileSync(`./keys/${keyNameToUse}/key.pub`, "utf8");

brdigeFactory
  .createOrHijack({ bridgeName: `br-${keyNameToUse}` })
  .then((bridge) => {
    let cleanupInProgress = false;

    const cleanupAtExit = () => {
      if (cleanupInProgress) {
        return;
      }

      cleanupInProgress = true;

      console.error("removing bridge");
      bridge
        .deleteLink()
        .then(() => {
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
      console.error(err);
      cleanupAtExit();
    });
    process.on("unhandledRejection", (err) => {
      console.error(err);
      cleanupAtExit();
    });

    const townhall = websocketSignaling.create();
    const secureTownhall = encryptedSignaling.create({
      townhall,
      publicKeys,
      privateKey,
    });

    secureTownhall.on("connected", () => {
      const packet = {
        type: "hello",
        from: clientId,
      };

      secureTownhall.send({ packet });
    });

    let peerSessions = {};

    secureTownhall.on("message", ({ key, packet }) => {
      console.log("packet =", packet);

      let peerSession = peerSessions[packet.from];

      if (!peerSession) {
        const name = Object.keys(publicKeys).find((n) => {
          return publicKeys[n] === key;
        });

        peerSession = peerSessionFactory.create({
          name,
          bridge,
          publicKey: publicKeys[name],
          sendToTownhall: secureTownhall.send,
          peerId: packet.from,
          clientId,
        });

        peerSessions = {
          ...peerSessions,
          [packet.from]: peerSession,
        };
      }

      peerSession.processPacket({ packet });
    });
  });
