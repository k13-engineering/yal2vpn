/* eslint-disable */
/* global describe */
/* global it */

import peerConnectionRtp from "../peer-connection-rtp.js";

const createFence = () => {
  let waitingFor = [];
  let listeners = [];

  const add = () => {
    const func = () => {
      waitingFor = waitingFor.filter((entry) => {
        return entry !== func;
      });

      if (waitingFor.length === 0) {
        listeners.forEach((l) => {
          l.resolve();
        });
        listeners = [];
      }
    };

    waitingFor = [...waitingFor, func];

    return func;
  };

  const error = (err) => {
      listeners.forEach((l) => {
          l.reject(err);
      });
      listeners = [];
  };

  const promise = () => {
    return new Promise((resolve, reject) => {
      if (waitingFor.length === 0) {
        resolve();
        return;
      }

      listeners = [...listeners, { resolve, reject }];
    });
  };

  return {
    add,
    error,

    promise,
  };
};

const transferAndVerify = ({ from, to, packet }) => {
  return new Promise((resolve, reject) => {
    to.once("packet", (packetReceived) => {
      if (Buffer.compare(packetReceived, packet) === 0) {
        resolve();
      } else {
        reject(Error(`received packet differs`));
      }
    });

    from.send({ packet });
  });
};

const withConnectionPair = (fn) => {
  const logger = {
    log: console.log,
  };

  const fence = createFence();
  const conn1Ready = fence.add();
  const conn2Ready = fence.add();

  let conn1 = undefined;
  let conn2 = undefined;

  const sendToTownhall = ({ packet }) => {
    if (packet.to === 1) {
      conn1?.processPacket({ packet });
    }

    if (packet.to === 2) {
      conn2?.processPacket({ packet });
    }
  };

  conn1 = peerConnectionRtp.create({
    logger,
    clientId: 1,
    peerId: 2,
    sendToTownhall,
  });
  conn1.once("connected", () => {
    conn1Ready();
  });

  conn2 = peerConnectionRtp.create({
    logger,
    clientId: 2,
    peerId: 1,
    sendToTownhall,
  });
  conn2.once("connected", () => {
    conn2Ready();
  });

  conn1.processPacket({
    packet: {
      type: "hello",
    },
  });

  return fence.promise().then(() => {
    return fn({ conn1, conn2 });
  }).finally(() => {
    conn1.close();
    conn2.close();
  });
};

const createTestBuffer = ({ size }) => {
  const result = Buffer.alloc(size);

  for(let i = 0; i < size; i += 1) {
    result.writeUInt8(i % 256, i);
  }

  return result;
};

describe.only("peer-connection-rtp", function () {
  this.timeout(120000);

  [
    {
      packets: [
        createTestBuffer({ size: 32 }),
      ]
    },
    {
      packets: [
        createTestBuffer({ size: 32 }),
        createTestBuffer({ size: 32 })
      ]
    }
  ].forEach(({ packets }) => {
    it(`should transfer ${packets.length} packet${packets.length > 1 ? "s" : ""} (${packets.map((pkt) => `buffer of size ${pkt.length}`).join(", ")}) correctly`, () => {
      // datachannel.initLogger("Debug");
      return withConnectionPair(({ conn1, conn2 }) => {
        let packetsRemaining = packets;

        const maybeTransferNext = () => {
          if (packetsRemaining.length === 0) {
            return;
          }

          const packet = packetsRemaining[0];
          packetsRemaining = packetsRemaining.slice(1);

          return transferAndVerify({ from: conn1, to: conn2, packet }).then(() => {
            return maybeTransferNext();
          });
        };

        return maybeTransferNext();
      });
  
      const logger = {
        log: console.log,
      };
  
      const fence = createFence();
      const conn1ReceivedPacket = fence.add();
      const conn2ReceivedPacket = fence.add();
  
      let conn1 = undefined;
      let conn2 = undefined;
  
      const sendToTownhall = ({ packet }) => {
        if (packet.to === 1) {
          conn1?.processPacket({ packet });
        }
  
        if (packet.to === 2) {
          conn2?.processPacket({ packet });
        }
      };
  
      conn1 = peerConnectionRtp.create({
        logger,
        clientId: 1,
        peerId: 2,
        sendToTownhall,
      });
      conn1.on("connected", () => {
        conn1.send({ packet: Buffer.alloc(32) });
      });
      conn1.on("packet", (packet) => {
        console.log("packet on conn1", packet);
        conn1ReceivedPacket();
      });
  
      conn2 = peerConnectionRtp.create({
        logger,
        clientId: 2,
        peerId: 1,
        sendToTownhall,
      });
      conn2.on("connected", () => {
        conn2.send({ packet: Buffer.alloc(64) });
      });
      conn2.on("packet", (packet) => {
        console.log("packet on conn2", packet);
        conn2ReceivedPacket();
      });
  
      conn1.processPacket({
        packet: {
          type: "hello",
        },
      });
  
      return fence.promise().finally(() => {
          conn1.close();
          conn2.close();
      });
    });
  });

  
});
