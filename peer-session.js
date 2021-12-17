import peerConnectionFactory from "./peer-connection.js";
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
  connection.on("packet", (msg) => {
    // console.log("received packet!", msg);
    virtualPort.send({ packet: msg });
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
