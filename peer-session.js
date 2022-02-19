import peerConnectionFactory from "./peer-connection-rtp.js";
import virtualPortFactory from "./virtual-port.js";
import EventEmitter from "events";

const create = ({
  logger,
  name,
  bridge,
  publicKey,
  sendToTownhall,
  peerId,
  clientId,
}) => {
  const emitter = new EventEmitter();

  const passive = peerId < clientId;

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

  const virtualPort = virtualPortFactory.create({ logger: peerLogger, bridge });
  const connection = peerConnectionFactory.create({
    logger: peerLogger,
    clientId,
    peerId,
    sendToTownhall,
  });

  virtualPort.on("packet", (packet) => {
    // console.log(`packet with ${packet.length} bytes from TAP`);
    connection.send({ packet });
  });

  connection.on("connected", () => {
    peerLogger.log("peer-to-peer channel established");
    // console.log("global connected!");
  });
  connection.on("disconnected", () => {
    peerLogger.log("peer-to-peer channel disconnected");
    emitter.emit("dead");
    // console.log("discconnected!");
  });
  connection.on("error", (err) => {
    peerLogger.log("peer-to-peer error", err);
    connection.close();
    emitter.emit("dead");
  });
  connection.on("packet", (msg) => {
    console.log("received packet!", msg);
    try {
      virtualPort.send({ packet: msg });
    } catch (ex) {
      peerLogger.error("error sending packet to virtual port", ex);
      emitter.emit("dead");
    }
  });

  const close = () => {
    peerLogger.log("closing session");
    connection.close();
    virtualPort.close();
  };

  return {
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),

    processPacket: connection.processPacket,
    close,
  };
};

export default {
  create,
};
