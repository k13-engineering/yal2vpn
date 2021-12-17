import peerConnectionFactory from "./peer-connection.js";
import virtualPortFactory from "./virtual-port.js";

const create = ({
  logger,
  name,
  bridge,
  publicKey,
  sendToTownhall,
  peerId,
  clientId,
}) => {
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
    // console.log("discconnected!");
  });
  connection.on("packet", (msg) => {
    // console.log("received packet!", msg);
    virtualPort.send({ packet: msg });
  });

  const close = () => {
    connection.close();
    virtualPort.close();
  };

  return {
    processPacket: connection.processPacket,
    close,
  };
};

export default {
  create,
};
