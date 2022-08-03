/* eslint-disable */

import websocketSignaling from "./websocket-signaling.js";
import encryptedSignaling from "./encrypted-signaling.js";
import peerSessionFactory from "./peer-session.js";
import loggerFactory from "./logger.js";
import ethBridgeFactory from "./eth-bridge.js";
import tuntap2 from "node-tuntap2";
import naiveEmitter from "naive-emitter";

const verifyParameters = ({ privateKey, publicKeys, interfaceName }) => {
  if (!privateKey) {
    throw Error("needs privateKey");
  }

  if (!publicKeys) {
    throw Error("needs publicKeys");
  }

  if (!interfaceName) {
    throw Error("needs bridgeName");
  }
};

const create = ({
  logger: loggerProvided,
  clientId,
  interfaceName,
  townhallUrl,
  privateKey,
  publicKeys,
}) => {
  const logger = loggerProvided || loggerFactory.create({});

  const errorEmitter = naiveEmitter.create();

  verifyParameters({ privateKey, publicKeys, interfaceName });

  logger.log(`using client id ${clientId}`);

  const tapDevice = tuntap2.create({ logger, name: interfaceName });
  tapDevice.onOpen(({ ifindex, name }) => {
    logger.log(`interface ${name} [${ifindex}] created`);
  });
  tapDevice.onError(({ error }) => {
    logger.error(`could not create TAP device: ${error.message}`);

    const errorToEmit = Error("could not create TAP device", { cause: error });

    const { delivered } = errorEmitter.emit({ error: errorToEmit });
    if (!delivered) {
      throw Error("unhandeled error event", { cause: errorToEmit });
    }
  });

  const ethBridge = ethBridgeFactory.create({
    localInterface: tapDevice
  });

  let peerSessions = {};

  logger.log(`trying to connect to signaling server`);

  const townhall = websocketSignaling.create({
    logger,
    url: townhallUrl,
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

  secureTownhall.onConnected(() => {
    logger.log("connected to signaling server");
    sendHello();
  });

  secureTownhall.onDisconnected(() => {
    logger.warn("lost connection to signaling server");
  });

  const helloIntervalHandle = setInterval(() => {
    sendHello();
  }, 60 * 1000);

  const maybeCreatePeerSession = ({ key, peerId }) => {
    let peerSession = peerSessions[peerId];

    if (!peerSession) {
      const name = Object.keys(publicKeys).find((n) => {
        return publicKeys[n] === key;
      });

      peerSession = peerSessionFactory.create({
        logger,
        name,
        publicKey: publicKeys[name],
        sendToTownhall: secureTownhall.send,
        peerId,
        clientId,
        ethBridge
      });

      peerSession.onDead(() => {
        peerSession.close();

        const { [peerId]: _, ...other } = peerSessions;
        peerSessions = {
          ...other,
        };
      });

      peerSessions = {
        ...peerSessions,
        [peerId]: peerSession,
      };
    }

    return peerSession;
  };

  const processPacket = ({ key, packet }) => {
    const peerSession = maybeCreatePeerSession({
      key,
      peerId: packet.from,
    });

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
  };

  secureTownhall.onMessage(({ message }) => {
    const { key, packet } = message;

    if (packet.from === clientId) {
      return;
    }

    if (packet.to !== undefined && packet.to !== clientId) {
      return;
    }

    processPacket({ key, packet });
  });

  const close = () => {
    clearInterval(helloIntervalHandle);

    Object.keys(peerSessions).forEach((peerId) => {
      const peerSession = peerSessions[peerId];
      peerSession.close();
    });

    townhall.close();
    tapDevice.close();
  };

  return {
    onError: errorEmitter.on,

    close,
  };
};

export default {
  create,
};
