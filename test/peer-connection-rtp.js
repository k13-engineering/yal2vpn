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

describe.only("peer-connection-rtp", function () {
  this.timeout(120000);

  it("should work", () => {
    // datachannel.initLogger("Debug");

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
