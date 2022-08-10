import naiveEmitter from "naive-emitter";

const readMACFromBuffer = ({ buffer }) => {
  let hexNumbersAsString = [];
  for (let i = 0; i < 6; i += 1) {
    hexNumbersAsString = [
      ...hexNumbersAsString,
      ("0" + buffer.readUInt8(i).toString(16)).substr(-2),
    ];
  }

  return hexNumbersAsString.join(":");
};

const readIPv4FromBuffer = ({ buffer }) => {
  let octetsAsString = [];
  for (let i = 0; i < 4; i += 1) {
    octetsAsString = [...octetsAsString, buffer.readUInt8(i).toString(10)];
  }

  return octetsAsString.join(".");
};

const isMulticastMAC = ({ mac }) => {
  return [
    "01:80:c2",
    "01:1b:19",
    "01:00:5e",
    "33:33",
    "01:0c:cd",
    "01:00:0c",
  ].some((prefix) => {
    return mac.startsWith(prefix);
  });
};

// const parseARPPacket = ({ ethernetPayload }) => {
//   const hardwareAddressType = ethernetPayload.readUInt16BE(0);
//   const protocolAddressType = ethernetPayload.readUInt16BE(2);
//   const hardwareAddressSize = ethernetPayload.readUInt8(4);
//   const protocollAddressSize = ethernetPayload.readUInt8(5);

//   const operation = ethernetPayload.readUInt16BE(6);

//   const sourceMAC = readMACFromBuffer({ buffer: ethernetPayload.slice(8, 14) });
//   const sourceIP = readIPv4FromBuffer({
//     buffer: ethernetPayload.slice(14, 18),
//   });

//   const destMAC = readMACFromBuffer({ buffer: ethernetPayload.slice(18, 24) });
//   const destIP = readIPv4FromBuffer({ buffer: ethernetPayload.slice(24, 28) });

//   return {
//     hardwareAddressType,
//     protocolAddressType,
//     hardwareAddressSize,
//     protocollAddressSize,
//     operation,
//     sourceMAC,
//     sourceIP,
//     destMAC,
//     destIP,
//   };
// };

const parsePacket = ({ packet }) => {
  const destMAC = readMACFromBuffer({ buffer: packet.slice(0, 6) });
  const srcMAC = readMACFromBuffer({ buffer: packet.slice(6, 12) });
  const etherType = packet.readUInt16BE(12);

  return {
    destMAC,
    srcMAC,
    etherType,
  };
};

const createForwarder = ({ broadcast, unicast }) => {
  const forward = ({ packet }) => {
    const { destMAC, srcMAC } = parsePacket({ packet });

    if (isMulticastMAC({ mac: destMAC })) {
      // TODO: implement multicast
      // console.warn("WARN multicast not implemented yet");

      broadcast({
        packet,
      });
    } else if (destMAC === "ff:ff:ff:ff:ff:ff") {
      broadcast({
        packet,
      });
    } else {
      unicast({
        destMAC,
        srcMAC,

        packet,
      });
    }

    return {
      srcMAC,
    };
  };

  return {
    forward,
  };
};

const create = ({ localInterface }) => {
  let ports = [];

  // TODO: immutability
  const macAddressesToPeerPort = {};

  const maybePauseOrResumeLocalInterface = () => {
    const anyPaused = ports.some((port) => {
      return port.isPaused();
    });

    if (anyPaused) {
      console.log("pausing local interface");
      localInterface.pause();
    } else {
      localInterface.resume();
    }
  };

  let portIdCounter = 0;

  const port = () => {
    const packetEmitter = naiveEmitter.create();

    const sendToPort = ({ packet }) => {
      packetEmitter.emit({ packet });
    };

    let paused = false;

    const isPaused = () => {
      return paused;
    };

    const portId = portIdCounter;
    portIdCounter += 1;

    const portHandle = {
      portId,
      sendToPort,
      isPaused,
    };

    ports = [...ports, portHandle];

    const forwarder = createForwarder({
      broadcast: ({ packet }) => {
        // forward broadcasts from peers only to TAP interface
        localInterface.send({ packet });
      },

      unicast: ({ destMAC, packet }) => {
        // forward all unicasts from peers to TAP interface
        localInterface.send({ packet });
      },
    });

    const sendToBridge = ({ packet }) => {
      const { srcMAC } = forwarder.forward({ packet });
      macAddressesToPeerPort[srcMAC] = portHandle;
    };

    const pause = () => {
      paused = true;
      maybePauseOrResumeLocalInterface();
    };

    const resume = () => {
      paused = false;
      maybePauseOrResumeLocalInterface();
    };

    const close = () => {
      ports = ports.filter((p) => {
        return p !== portHandle;
      });
    };

    return {
      onPacket: packetEmitter.on,

      sendToBridge,

      pause,
      resume,

      close,
    };
  };

  const broadcastToAllPeers = ({ packet }) => {
    ports.forEach((peerPort) => {
      peerPort.sendToPort({ packet });
    });
  };

  const localForwarder = createForwarder({
    broadcast: ({ packet }) => {
      // send broadcasts from local interface to all peers

      broadcastToAllPeers({ packet });
    },

    unicast: ({ destMAC, packet }) => {
      const peerPort = macAddressesToPeerPort[destMAC];

      if (peerPort === undefined) {
        broadcastToAllPeers({ packet });
      } else {
        peerPort.sendToPort({ packet });
      }
    },
  });

  localInterface.onPacket(({ packet }) => {
    localForwarder.forward({ packet });
  });

  return {
    port,
  };
};

export default {
  create,
};
