import peerConnectionFactory from "./peer-connection-rtp.js";
import naiveEmitter from "naive-emitter";

const create = ({
  logger,
  name,
  publicKey,
  sendToTownhall,
  peerId,
  clientId,
  ethBridge
}) => {
  const deadEmitter = naiveEmitter.create();

  let peerLogger = {};
  Object.keys(logger).forEach((key) => {
    peerLogger = {
      ...peerLogger,
      [key]: (...args) => {
        logger[key](`{ ${name} @ ${peerId} }`, ...args);
      },
    };
  });

  peerLogger.log("started session");

  const bridgePort = ethBridge.port();

  const connection = peerConnectionFactory.create({
    logger: peerLogger,
    clientId,
    peerId,
    sendToTownhall,
  });

  connection.onDrain(() => {
    // console.log("drain from webrtc, resuming virtual port");
    // virtualPort.resume();
  });

  // virtualPort.onError(({ error }) => {
  //   throw error;
  // });

  bridgePort.onPacket(({ packet }) => {
    // console.log(`packet with ${packet.length} bytes from TAP`);

    connection.send({ packet });

    // const { shouldDrain } = connection.send({ packet });
    // if (shouldDrain) {
    //   // console.log("pausing virtual port");
    //   virtualPort.pause();
    // }

    // console.log(`virtual port -> webrtc, ${packet.length} bytes`, { shouldDrain });
  });

  connection.onOpen(() => {
    peerLogger.log("peer-to-peer channel established");
    // console.log("global connected!");
  });
  connection.onClose(() => {
    peerLogger.log("peer-to-peer channel disconnected");
    deadEmitter.emit();
    // console.log("discconnected!");
  });
  connection.onError(({ error }) => {
    peerLogger.log("peer-to-peer error:", error.message || error);
    connection.close();
    deadEmitter.emit();
  });
  connection.onPacket(({ packet }) => {
    // console.log("received packet!", msg);
    try {
      // virtualPort.send({ packet: msg });
      bridgePort.sendToBridge({ packet });
    } catch (ex) {
      peerLogger.error("error sending packet to virtual port", ex);
      deadEmitter.emit();
    }
  });

  let closed = false;

  const close = () => {
    if (closed) {
      return;
    }

    peerLogger.log("closing session");
    closed = true;

    connection.close();
    bridgePort.close();
    // virtualPort.close();
  };

  return {
    onDead: deadEmitter.on,

    processPacket: connection.processPacket,
    close,
  };
};

export default {
  create,
};
