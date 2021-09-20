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

const create = ({ localInterface }) => {
  let ports = [];

  let macAddressToPort = {};

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

  const broadcast = ({ sourcePort, packet }) => {
    ports.forEach((port) => {
      if (port === sourcePort) {
        return;
      }

      port.sendToPort({ packet });
    });
  };

  const port = () => {
    const packetEmitter = naiveEmitter.create();

    const sendToPort = ({ packet }) => {
      packetEmitter.emit({ packet });
    };

    let paused = false;

    const isPaused = () => {
      return paused;
    };

    const portHandle = {
      sendToPort,
      isPaused
    };

    ports = [...ports, portHandle];

    const send = ({ packet }) => {
      const destMAC = readMACFromBuffer({ buffer: packet.slice(0, 6) });
      const srcMAC = readMACFromBuffer({ buffer: packet.slice(6, 12) });
      const etherType = packet.readUInt16BE(12);

      //   if (etherType === 0x0806) {
      //     const arpPacket = parseARPPacket({ ethernetPayload: packet.slice(14) });
      //     console.log("arpPacket =", arpPacket);
      //   }

      macAddressToPort[srcMAC] = portHandle;

    //   console.log("bridge in", { srcMAC, destMAC, etherType });

      if (isMulticastMAC({ mac: destMAC })) {
        // TODO: implement multicast
        // console.warn("WARN multicast not implemented yet");

        broadcast({
          sourcePort: portHandle,
          packet,
        });
        return;
      }

      if (destMAC === "ff:ff:ff:ff:ff:ff") {
        broadcast({
          sourcePort: portHandle,
          packet,
        });
        return;
      }

      const destPortHandle = macAddressToPort[destMAC];
      if (destPortHandle === undefined) {
        return;
      } else if (destPortHandle === portHandle) {
        // TODO: hairpin?
        return;
      }

      destPortHandle.sendToPort({ packet });
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

      send,

      pause,
      resume,

      close,
    };
  };

  const localPort = port();

  localInterface.onPacket(({ packet }) => {
    localPort.send({ packet });
  });

  localPort.onPacket(({ packet }) => {
    localInterface.send({ packet });
  });

  return {
    port,
  };
};

export default {
  create,
};
