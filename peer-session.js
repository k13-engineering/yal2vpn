import peerConnectionFactory from "./peer-connection.js";
import virtualPortFactory from "./virtual-port.js";

const create = ({ name, bridge, publicKey, sendToTownhall, peerId, clientId }) => {
  const passive = peerId < clientId;

  const virtualPort = virtualPortFactory.create({ bridge });
  const connection = peerConnectionFactory.create({ clientId, peerId, sendToTownhall });


  virtualPort.on("packet", (packet) => {
    connection.send({ packet });
  });

  connection.on("connected", () => {
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
    close
  };
};

export default {
  create,
};
